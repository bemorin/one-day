import Foundation
import WebKit

/// The page's questions to iCloud (app.js, the iCloud cloud of "Sync with your cloud"), each answered: the account,
/// the copy, writing it, erasing it. Errors come back as the words app.js knows. Only the app's own pages are heard.
final class CloudBridge: NSObject, WKScriptMessageHandlerWithReply {
  static let name = "onedayCloud"
  /// iCloud, or nil in a build without it: then every question is answered "unavailable".
  let store: CloudStore?

  init(store: CloudStore?) {
    self.store = store
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) async -> (
    Any?, String?
  ) {
    guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.protocol == SiteFiles.scheme,
      let body = message.body as? [String: Any], let op = body["op"] as? String
    else { return (nil, "refused") }
    return await answer(op: op, text: body["text"] as? String, tag: body["tag"] as? String, user: body["user"] as? String)
  }

  /// One question, answered: a value for the page, or the kind of failure. `user`: the account the page syncs with,
  /// which a write or an erase must still find signed in.
  func answer(op: String, text: String?, tag: String?, user: String? = nil) async -> (Any?, String?) {
    guard let database = store?.database else { return (nil, "unavailable") }
    do {
      switch op {
      case "account":
        let account = try await database.account()
        return (["status": account.status, "user": account.user], nil)
      case "fetch":
        guard let copy = try await database.fetch() else { return (NSNull(), nil) }
        return (["tag": copy.tag, "text": copy.text], nil)
      case "save":
        guard let text else { return (nil, "http") }
        let written = try await database.save(text, over: tag, as: user)
        return (["tag": written], nil)
      case "delete":
        try await database.delete(as: user)
        return (true, nil)
      default:
        return (nil, "refused")
      }
    } catch {
      return (nil, CloudStore.kind(of: error))
    }
  }
}
