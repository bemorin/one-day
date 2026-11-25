import Foundation
import Testing
import WebKit

@testable import OneDay

@Suite("The day in a web view", .timeLimit(.minutes(3)))
struct WebViewTests {
  @Test("The page runs in a secure context, without service worker or passkeys, and its changes reach the app's copy")
  func page() async throws {
    let file = FileManager.default.temporaryDirectory.appending(path: "one-day-web-\(UUID().uuidString)/saved.json")
    let saved = SavedState(file: file)
    let bridge = Bridge(saved: saved)
    let site = try #require(SiteFiles.bundled())
    let web = WebHost.makeWebView(site: site, bridge: bridge, store: .nonPersistent())
    web.load(URLRequest(url: SiteFiles.home))
    try await eventually {
      try await web.callAsyncJavaScript(
        "return document.readyState === 'complete' && !!document.getElementById('app')", contentWorld: .page) as? Bool == true
    }

    let found = try await web.callAsyncJavaScript(
      """
      return [String(isSecureContext), typeof crypto.subtle, String('serviceWorker' in navigator),
        String('PublicKeyCredential' in window), location.origin].join(' ')
      """, contentWorld: .page) as? String
    #expect(found == "true object false false oneday://localhost")

    _ = try await web.callAsyncJavaScript("localStorage.setItem('oneday.theme', 'dark'); return true", contentWorld: .page)
    try await eventually { saved.items["oneday.theme"] == "dark" }
    #expect(saved.seq > 0)
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
