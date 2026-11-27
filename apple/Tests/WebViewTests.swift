import Foundation
import Testing
import WebKit

#if os(iOS)
  import UIKit
#else
  import AppKit
#endif

@testable import OneDay

@Suite("The day in a web view", .timeLimit(.minutes(3)))
struct WebViewTests {
  let saved = SavedState(file: FileManager.default.temporaryDirectory.appending(path: "one-day-web-\(UUID().uuidString)/saved.json"))
  let cloud = FakeCloud()
  let signIns = FakeSignIns()
  let sheet = FakeSheet()

  /// The app's page in a web view of its own, iCloud, the sign-in sheet and the keychain stood in for, nothing kept once
  /// the test ends.
  func open() async throws -> (WKWebView, Bridge) {
    let bridge = Bridge(saved: saved, signIns: signIns)
    let site = try #require(SiteFiles.bundled())
    let web = WebHost.makeWebView(
      site: site, bridge: bridge, cloud: CloudBridge(store: CloudStore(database: cloud), sheet: sheet), store: .nonPersistent())
    show(web)
    web.load(URLRequest(url: SiteFiles.home))
    // a call that lands while the page is still loading fails: it is simply asked again
    try await eventually {
      (try? await web.callAsyncJavaScript(
        "return document.readyState === 'complete' && !!document.getElementById('app')", contentWorld: .page)) as? Bool == true
    }
    return (web, bridge)
  }

  @Test("The page runs in a secure context, without service worker or passkeys, and its changes reach the app's copy")
  func page() async throws {
    let (web, bridge) = try await open()
    let found = try await web.callAsyncJavaScript(
      """
      return [String(isSecureContext), typeof crypto.subtle, String('serviceWorker' in navigator),
        String('PublicKeyCredential' in window), location.origin, String(oneDayApp.icloud), String(oneDayApp.signin)].join(' ')
      """, contentWorld: .page) as? String
    #expect(found == "true object false false oneday://localhost true true")

    _ = try await web.callAsyncJavaScript("localStorage.setItem('oneday.theme', 'dark'); return true", contentWorld: .page)
    try await eventually { saved.items["oneday.theme"] == "dark" }
    #expect(saved.seq > 0)
    #expect(bridge.errors.isEmpty, "The page failed: \(bridge.errors)")
  }

  @Test("iCloud through the page itself: Sync with your cloud, iCloud, a passphrase, and only a sealed copy reaches it")
  func syncThroughThePage() async throws {
    let (web, bridge) = try await open()
    _ = try await web.callAsyncJavaScript(
      """
      const wait = async (f, ms) => {
        const end = Date.now() + ms;
        for (;;) {
          const v = f();
          if (v) return v;
          if (Date.now() > end) throw new Error('waited too long: ' + f);
          await new Promise(r => setTimeout(r, 100));
        }
      };
      document.getElementById('spill').click();
      (await wait(() => document.querySelector('#syCh [data-c="icloud"]:not([disabled])'), 20000)).click();
      await wait(() => document.getElementById('syT').textContent === 'Choose a sync passphrase', 20000);
      document.getElementById('syPass').value = 'a long sync passphrase';
      document.getElementById('syPass2').value = 'a long sync passphrase';
      document.getElementById('syOk').checked = true;
      document.getElementById('syGo').click();
      await wait(() => document.getElementById('syT').textContent === 'Sync is on', 60000);
      return true;
      """, contentWorld: .page)
    try await eventually { cloud.copy != nil }
    let text = try #require(cloud.copy?.text)
    #expect(text.contains(#""kind":"sync""#))
    #expect(!text.contains("Tick the circle"))
    #expect(bridge.errors.isEmpty, "The page failed: \(bridge.errors)")
  }

  @Test("The page's questions to iCloud get their answers, a refusal included")
  func iCloud() async throws {
    let (web, bridge) = try await open()
    let said = try await web.callAsyncJavaScript(
      """
      const ask = o => window.webkit.messageHandlers.onedayCloud.postMessage(o);
      const none = await ask({ op: 'fetch' });
      const first = await ask({ op: 'save', text: 'sealed', tag: null });
      const read = await ask({ op: 'fetch' });
      let stale = '';
      try { await ask({ op: 'save', text: 'late', tag: 'old' }); } catch (e) { stale = e.message; }
      return [String(none), read.text, String(read.tag === first.tag), stale].join(' ');
      """, contentWorld: .page) as? String
    #expect(said == "null sealed true conflict")
    #expect(cloud.copy?.text == "sealed")
    #expect(bridge.errors.isEmpty, "The page failed: \(bridge.errors)")
  }

  @Test("The page's sign-in to another cloud goes to the sheet, and the address the cloud sends you to comes back")
  func signInSheet() async throws {
    let (web, bridge) = try await open()
    let said = try await web.callAsyncJavaScript(
      """
      const ask = o => window.webkit.messageHandlers.onedayCloud.postMessage(o);
      const back = await ask({ op: 'signin', url: 'https://www.dropbox.com/oauth2/authorize?state=s1' });
      let refused = '';
      try { await ask({ op: 'signin', url: 'https://example.com/' }); } catch (e) { refused = e.message; }
      return [back, refused].join(' ');
      """, contentWorld: .page) as? String
    #expect(said == "https://day.bemorin.com/oauth/?code=c1&state=s1 refused")
    #expect(sheet.opened.count == 1)
    #expect(bridge.errors.isEmpty, "The page failed: \(bridge.errors)")
  }

  @Test("The keychain's sign-in starts each page, and the page's changes to it reach the keychain, never the app's file")
  func keychain() async throws {
    let (web, bridge) = try await open()
    // the page's sign-in, as bridge.js sends it
    _ = try await web.callAsyncJavaScript(
      #"webkit.messageHandlers.oneday.postMessage({ op: 'auth.keep', value: '{"v":1,"cloud":"google","a":"g-1"}' }); return true"#,
      contentWorld: .page)
    try await eventually { signIns.text == #"{"v":1,"cloud":"google","a":"g-1"}"# }
    // the next page starts with it
    WebHost.refreshBoot(of: web, bridge: bridge)
    let next = web.configuration.userContentController.userScripts.first?.source ?? ""
    #expect(next.contains(#""signin":true"#))
    #expect(next.contains("g-1"))
    // forgotten: sync stopped
    _ = try await web.callAsyncJavaScript(
      "webkit.messageHandlers.oneday.postMessage({ op: 'auth.keep', value: null }); return true", contentWorld: .page)
    try await eventually { signIns.text == nil }
    #expect(!saved.items.values.contains { $0.contains("g-1") })
    #expect(bridge.errors.isEmpty, "The page failed: \(bridge.errors)")
  }
}

/// The web view in the app's window while a test runs, so that the page lays out and its animations run as on screen.
func show(_ web: WKWebView) {
  #if os(iOS)
    let window = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first
    web.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
    window?.addSubview(web)
  #else
    web.frame = NSRect(x: 0, y: 0, width: 820, height: 760)
    NSApplication.shared.windows.first?.contentView?.addSubview(web)
  #endif
}

nonisolated struct TimedOut: Error {}

/// Waits until `check` holds, looking again every tenth of a second.
func eventually(timeout: Duration = .seconds(90), _ check: () async throws -> Bool) async throws {
  let clock = ContinuousClock()
  let end = clock.now.advanced(by: timeout)
  while clock.now < end {
    if try await check() { return }
    try await Task.sleep(for: .milliseconds(100))
  }
  throw TimedOut()
}
