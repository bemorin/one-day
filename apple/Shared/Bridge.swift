import Foundation
import WebKit
import os

/// The page's messages to the app, as bridge.js posts them: what it keeps (into the app's file) and what went wrong.
/// Only the app's own pages are heard.
final class Bridge: NSObject, WKScriptMessageHandler {
  static let name = "oneday"
  let saved: SavedState
  /// The page's uncaught errors, the last few (the tests read them).
  private(set) var errors: [String] = []
  private let log = Logger(subsystem: "com.bemorin.oneday", category: "page")

  init(saved: SavedState) {
    self.saved = saved
  }

  /// The keys bridge.js sends: One Day's own (`oneday.…`), never its line number (`oneday.app`).
  static func isKept(_ key: String) -> Bool {
    key.hasPrefix("oneday.") && key != "oneday.app" && key.count <= 64
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
    case "rejection":
      let text = body["message"] as? String ?? "?"
      log.notice("A promise of the page failed: \(text, privacy: .private)")
    default:
      break
    }
  }
}
