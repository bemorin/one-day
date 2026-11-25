import Foundation
import WebKit

/// One Day's web view: the site served by the app, the bridges to the app, and what the page finds before its own code.
enum WebHost {
  #if os(iOS)
    static let platform = "ios"
  #else
    static let platform = "macos"
  #endif

  static var version: String {
    let info = Bundle.main.infoDictionary
    let short = info?["CFBundleShortVersionString"] as? String ?? "?"
    let build = info?["CFBundleVersion"] as? String ?? "?"
    return "\(short) (\(build))"
  }

  /// A web view for the app's pages. Tests give their own data store, so they never touch the app's, and their own
  /// stand-in for iCloud.
  static func makeWebView(site: SiteFiles, bridge: Bridge, cloud: CloudBridge, store: WKWebsiteDataStore = .default()) -> WKWebView {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = store
    config.setURLSchemeHandler(SiteHandler(site: site), forURLScheme: SiteFiles.scheme)
    config.userContentController.add(bridge, name: Bridge.name)
    config.userContentController.addScriptMessageHandler(cloud, contentWorld: .page, name: CloudBridge.name)
    #if os(iOS)
      config.dataDetectorTypes = []
      config.allowsInlineMediaPlayback = true
    #endif
    let web = WKWebView(frame: .zero, configuration: config)
    bridge.icloud = cloud.store != nil
    refreshBoot(of: web, bridge: bridge)
    #if DEBUG
      web.isInspectable = true
    #endif
    #if os(iOS)
      web.isOpaque = false
      web.backgroundColor = .clear
      web.scrollView.contentInsetAdjustmentBehavior = .never
    #else
      web.underPageBackgroundColor = .clear
    #endif
    return web
  }

  /// The script every page of the app runs first (bridge.js), with what the app's file holds now. It is set again
  /// before each page of the app opens, so a page always starts from the latest copy.
  static func refreshBoot(of web: WKWebView, bridge: Bridge) {
    let content = web.configuration.userContentController
    content.removeAllUserScripts()
    guard let url = Bundle.main.url(forResource: "bridge", withExtension: "js"),
      let script = try? String(contentsOf: url, encoding: .utf8)
    else { return }
    let boot = bridge.saved.boot(platform: platform, version: version, icloud: bridge.icloud)
    let source = script.replacingOccurrences(of: "/*BOOT*/null", with: boot)
    content.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
  }
}
