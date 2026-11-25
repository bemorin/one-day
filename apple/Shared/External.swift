import SwiftUI

/// What leaves the app: a link (to the browser, or the mail app) and an exported file (to the share sheet).
enum External {
  /// Opens a web or mail link outside the app. Other schemes go nowhere.
  static func open(_ url: URL) {
    guard let scheme = url.scheme?.lowercased(), ["http", "https", "mailto"].contains(scheme) else { return }
    #if os(iOS)
      UIApplication.shared.open(url)
    #else
      _ = NSWorkspace.shared.open(url)
    #endif
  }

  #if os(iOS)
    /// Offers a file to the share sheet, over whatever the window shows.
    static func share(file: URL, from view: UIView) {
      let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
      if let popover = sheet.popoverPresentationController {
        popover.sourceView = view
        popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
      }
      var top = view.window?.rootViewController
      while let next = top?.presentedViewController { top = next }
      top?.present(sheet, animated: true)
    }
  #endif
}
