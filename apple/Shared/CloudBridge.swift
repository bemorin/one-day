import Foundation
import WebKit

/// The page's questions to the app about its clouds (app.js, "Sync with your cloud"), each answered. iCloud: the
/// account, the copy, writing it, erasing it. Google Drive, Dropbox and OneDrive: their sign-in page, in the system's
/// sheet (SignInSheet), and the address the cloud sends you back to. Errors come back as the words app.js knows. Only
/// the app's own pages are heard.
final class CloudBridge: NSObject, WKScriptMessageHandlerWithReply {
  static let name = "onedayCloud"
  /// iCloud, or nil in a build without it: then every question to it is answered "unavailable".
  let store: CloudStore?
  /// The sign-in sheet, or nil where the app can't open one: then the page offers iCloud alone.
  let sheet: (any SignInOpening)?

  init(store: CloudStore?, sheet: (any SignInOpening)? = nil) {
    self.store = store
    self.sheet = sheet
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) async -> (
    Any?, String?
  ) {
    guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.protocol == SiteFiles.scheme,
      let body = message.body as? [String: Any], let op = body["op"] as? String
    else { return (nil, "refused") }
    return await answer(
      op: op, text: body["text"] as? String, tag: body["tag"] as? String, user: body["user"] as? String,
      url: body["url"] as? String)
  }

  /// One question, answered: a value for the page, or the kind of failure. `user`: the account the page syncs with,
  /// which a write or an erase must still find signed in. `url`: the sign-in page to open.
  func answer(op: String, text: String?, tag: String?, user: String? = nil, url: String? = nil) async -> (Any?, String?) {
    switch op {
    case "signin":
      guard let sheet else { return (nil, "unavailable") }
      guard let url = url.flatMap({ URL(string: $0) }), SignInSheet.allows(url) else { return (nil, "refused") }
      do {
        return (try await sheet.open(url).absoluteString, nil)
      } catch SignInError.closed {
        return (nil, "closed")
      } catch {
        return (nil, "signin")
      }
    case "signin.cancel":
      sheet?.cancel()
      return (true, nil)
    default:
      break
    }
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
