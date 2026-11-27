import Foundation
import WebKit
import os

/// The page's messages to the app, as bridge.js posts them: what it keeps (into the app's file), its sign-in to a cloud
/// (into the keychain), and what went wrong. Only the app's own pages are heard.
final class Bridge: NSObject, WKScriptMessageHandler {
  static let name = "oneday"
  let saved: SavedState
  /// The sign-in to Google Drive, Dropbox or OneDrive, kept apart from the tasks (see SignIns).
  let signIns: any SignIns
  /// Whether this build carries iCloud: the page is told before its own code runs (oneDayApp.icloud).
  var icloud = false
  /// Whether the app opens the other clouds' sign-in pages (SignInSheet): the page is told too (oneDayApp.signin).
  var signin = false
  /// What the page's "Buy me an 🍎" does: opens the tip sheet (see TipJar).
  var onTip: (() -> Void)?
  /// The page's uncaught errors, the last few (the tests read them).
  private(set) var errors: [String] = []
  private let log = Logger(subsystem: "com.bemorin.oneday", category: "page")

  init(saved: SavedState, signIns: any SignIns) {
    self.saved = saved
    self.signIns = signIns
  }

  /// The keys bridge.js sends, and the only ones the app keeps: the tasks, the lock's vault, the timer, the theme.
  static let keys: Set<String> = ["oneday.v1", "oneday.vault", "oneday.timer", "oneday.theme"]

  static func isKept(_ key: String) -> Bool {
    keys.contains(key)
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.protocol == SiteFiles.scheme,
      let body = message.body as? [String: Any], let op = body["op"] as? String
    else { return }
    let seq = (body["seq"] as? NSNumber)?.intValue ?? 0
    switch op {
    case "store.set":
      if let key = body["key"] as? String, let value = body["value"] as? String, Self.isKept(key) {
        saved.apply(.set(key: key, value: value, seq: seq))
      }
    case "store.remove":
      if let key = body["key"] as? String, Self.isKept(key) {
        saved.apply(.remove(key: key, seq: seq))
      }
    case "store.all":
      if let all = body["items"] as? [String: Any] {
        var items: [String: String] = [:]
        for (key, value) in all {
          if Self.isKept(key), let value = value as? String { items[key] = value }
        }
        saved.apply(.all(items: items, seq: seq))
      }
    case "error":
      let text = body["message"] as? String ?? "?"
      errors = Array((errors + [text]).suffix(20))
      log.error("The page failed: \(text, privacy: .private)")
    case "auth.keep":
      // the sign-in as it is now, or none (null): sync stopped, or it goes with iCloud
      if body["value"] is NSNull {
        signIns.keep(nil)
      } else if let value = body["value"] as? String {
        signIns.keep(value)
      }
    case "tip":
      onTip?()
    case "rejection":
      let text = body["message"] as? String ?? "?"
      log.notice("A promise of the page failed: \(text, privacy: .private)")
    default:
      break
    }
  }
}
