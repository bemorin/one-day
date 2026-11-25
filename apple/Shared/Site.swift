import Foundation
import UniformTypeIdentifiers
import WebKit

/// One Day's site as the app carries it: the repository's `public` folder, copied into the app as it is published.
nonisolated struct SiteFiles: Sendable {
  static let scheme = "oneday"
  static let host = "localhost"
  /// The day's address. WebKit treats `oneday://localhost` as a secure context (its host is localhost, and the app
  /// answers its scheme), so the lock's encryption (Web Crypto) works as it does on the web.
  static let home = URL(string: "oneday://localhost/")!

  let root: URL

  init(root: URL) {
    self.root = root.standardizedFileURL
  }

  /// The site inside the app's bundle.
  static func bundled() -> SiteFiles? {
    Bundle.main.url(forResource: "public", withExtension: nil).map(SiteFiles.init(root:))
  }

  /// The file an address of the app names, or nil for anything else: another scheme or host, a path that climbs out
  /// of the site, a file that isn't there. A folder's address ends with a slash and gets its index.html.
  func file(for url: URL) -> URL? {
    guard url.scheme == Self.scheme, url.host() == Self.host else { return nil }
    var path = url.path(percentEncoded: false)
    if path.isEmpty || path.hasSuffix("/") { path += "index.html" }
    let file = root.appending(path: String(path.drop { $0 == "/" })).standardizedFileURL
    guard file.path.hasPrefix(root.path + "/") else { return nil }
    var folder: ObjCBool = false
    guard FileManager.default.fileExists(atPath: file.path, isDirectory: &folder), !folder.boolValue else { return nil }
    return file
  }

  /// What a file is, as the page's Content-Type says it.
  static func mimeType(for file: URL) -> String {
    let ext = file.pathExtension.lowercased()
    return switch ext {
    case "html", "htm": "text/html; charset=utf-8"
    case "js", "mjs": "text/javascript; charset=utf-8"
    case "css": "text/css; charset=utf-8"
    case "json": "application/json; charset=utf-8"
    case "webmanifest": "application/manifest+json; charset=utf-8"
    case "txt": "text/plain; charset=utf-8"
    case "xml": "application/xml; charset=utf-8"
    case "svg": "image/svg+xml"
    case "png": "image/png"
    case "jpg", "jpeg": "image/jpeg"
    case "webp": "image/webp"
    case "ico": "image/x-icon"
    case "woff2": "font/woff2"
    case "woff": "font/woff"
    case "mp4": "video/mp4"
    default: UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
    }
  }

  /// The answer to one request: the file, or the site's own 404 page.
  func answer(for url: URL) -> (status: Int, type: String, body: Data) {
    if let file = file(for: url), let body = try? Data(contentsOf: file) {
      return (200, Self.mimeType(for: file), body)
    }
    let missing = root.appending(path: "404.html")
    return (404, "text/html; charset=utf-8", (try? Data(contentsOf: missing)) ?? Data("Not found".utf8))
  }
}

/// Serves the site to the web view, from the app itself: nothing is fetched from the web.
final class SiteHandler: NSObject, WKURLSchemeHandler {
  let site: SiteFiles

  init(site: SiteFiles) {
    self.site = site
  }

  func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask) {
    guard let url = urlSchemeTask.request.url else {
      urlSchemeTask.didFailWithError(URLError(.badURL))
      return
    }
    let answer = site.answer(for: url)
    let headers = [
      "Content-Type": answer.type,
      "Content-Length": String(answer.body.count),
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    ]
    guard let response = HTTPURLResponse(url: url, statusCode: answer.status, httpVersion: "HTTP/1.1", headerFields: headers) else {
      urlSchemeTask.didFailWithError(URLError(.cannotParseResponse))
      return
    }
    urlSchemeTask.didReceive(response)
    urlSchemeTask.didReceive(answer.body)
    urlSchemeTask.didFinish()
  }

  // Every answer is given at once, in `start`: there is nothing left to stop.
  func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {}
}
