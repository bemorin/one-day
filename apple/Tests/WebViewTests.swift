import Foundation
import Testing
import WebKit

@testable import OneDay

@Suite("The day in a web view", .timeLimit(.minutes(3)))
struct WebViewTests {
  let saved = SavedState(file: FileManager.default.temporaryDirectory.appending(path: "one-day-web-\(UUID().uuidString)/saved.json"))
  let cloud = FakeCloud()

  /// The app's page in a web view of its own, iCloud stood in for, nothing kept once the test ends.
  func open() async throws -> (WKWebView, Bridge) {
    let bridge = Bridge(saved: saved)
    let site = try #require(SiteFiles.bundled())
    let web = WebHost.makeWebView(
      site: site, bridge: bridge, cloud: CloudBridge(store: CloudStore(database: cloud)), store: .nonPersistent())
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
        String('PublicKeyCredential' in window), location.origin, String(oneDayApp.icloud)].join(' ')
      """, contentWorld: .page) as? String
    #expect(found == "true object false false oneday://localhost true")

    _ = try await web.callAsyncJavaScript("localStorage.setItem('oneday.theme', 'dark'); return true", contentWorld: .page)
    try await eventually { saved.items["oneday.theme"] == "dark" }
    #expect(saved.seq > 0)
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
