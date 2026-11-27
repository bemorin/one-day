import SwiftUI
import WebKit
import os

/// The day: One Day's own page, in a web view that fills the window. Its links to the web open in the browser, its
/// backups are saved where the person chooses, and its files come from the app.
struct DayWebView {
  let saved: SavedState
  let tips: TipJar

  func makeCoordinator() -> Coordinator {
    Coordinator(saved: saved, tips: tips)
  }

  final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    let bridge: Bridge
    let cloud: CloudBridge
    private let sheet: SignInSheet
    private weak var web: WKWebView?
    private var downloads: [ObjectIdentifier: URL] = [:]
    private let log = Logger(subsystem: "com.bemorin.oneday", category: "web")

    init(saved: SavedState, tips: TipJar) {
      let sheet = SignInSheet()
      self.sheet = sheet
      bridge = Bridge(saved: saved, signIns: KeychainSignIns())
      cloud = CloudBridge(store: CloudStore.live(), sheet: sheet)
      super.init()
      bridge.onTip = { [weak tips] in tips?.open() }
      // the sign-in sheet stands over the day's window
      sheet.anchor = { [weak self] in self?.web?.window }
    }

    func makeWebView() -> WKWebView {
      guard let site = SiteFiles.bundled() else {
        log.fault("The app carries no site")
        return WKWebView()
      }
      let web = WebHost.makeWebView(site: site, bridge: bridge, cloud: cloud)
      web.navigationDelegate = self
      web.uiDelegate = self
      self.web = web
      web.load(URLRequest(url: SiteFiles.home))
      return web
    }

    // MARK: Where a page may go

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
      if navigationAction.shouldPerformDownload { return .download }
      guard let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() else { return .cancel }
      let main = navigationAction.targetFrame?.isMainFrame ?? true
      if scheme == SiteFiles.scheme {
        // a new page of the app (the guide, back to the day, a reload): it starts from the latest saved copy
        if main { WebHost.refreshBoot(of: webView, bridge: bridge) }
        return .allow
      }
      if !main, scheme == "about" || scheme == "blob" || scheme == "data" { return .allow }
      // anything else is the web, or another app: never inside the app's window
      External.open(url)
      return .cancel
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
      download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
      download.delegate = self
    }

    // The page stopped (iOS ended its process to free memory): it opens again from the saved copy.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
      log.notice("The page's process ended; reloading")
      WebHost.refreshBoot(of: webView, bridge: bridge)
      webView.load(URLRequest(url: SiteFiles.home))
    }

    // MARK: Windows and files the page asks for

    // A link that opens a new window (target="_blank"): the app's pages open in place, the rest in the browser.
    func webView(
      _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction,
      windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
      if let url = navigationAction.request.url {
        if url.scheme?.lowercased() == SiteFiles.scheme { webView.load(navigationAction.request) } else { External.open(url) }
      }
      return nil
    }

    #if os(macOS)
      // Import backup: the Mac's own file picker.
      func webView(
        _ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo
      ) async -> [URL]? {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        return panel.runModal() == .OK ? panel.urls : nil
      }
    #endif

    // MARK: Export backup (a download)

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String) async -> URL? {
      #if os(macOS)
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename
        panel.canCreateDirectories = true
        guard panel.runModal() == .OK, let url = panel.url else { return nil }
        // the panel has asked already whether to replace it; a download only writes where nothing is
        try? FileManager.default.removeItem(at: url)
        return url
      #else
        // written here first, then handed to the share sheet: Save to Files, AirDrop, Mail…
        let folder = FileManager.default.temporaryDirectory.appending(path: "Exports/\(UUID().uuidString)", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let url = folder.appending(path: suggestedFilename)
        downloads[ObjectIdentifier(download)] = url
        return url
      #endif
    }

    func downloadDidFinish(_ download: WKDownload) {
      #if os(iOS)
        guard let url = downloads.removeValue(forKey: ObjectIdentifier(download)), let web else { return }
        External.share(file: url, from: web)
      #endif
    }

    func download(_ download: WKDownload, didFailWithError error: any Error, resumeData: Data?) {
      downloads[ObjectIdentifier(download)] = nil
      log.error("A download failed: \(error.localizedDescription, privacy: .public)")
    }
  }
}

#if os(iOS)
  extension DayWebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
      context.coordinator.makeWebView()
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
  }
#else
  extension DayWebView: NSViewRepresentable {
    func makeNSView(context: Context) -> WKWebView {
      context.coordinator.makeWebView()
    }

    func updateNSView(_ webView: WKWebView, context: Context) {}
  }
#endif
