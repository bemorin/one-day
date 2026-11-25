import Foundation
import Testing

@testable import OneDay

@Suite("The site inside the app")
struct SiteFilesTests {
  let site: SiteFiles

  init() throws {
    site = try #require(SiteFiles.bundled(), "the app carries the site")
  }

  @Test("The day and the guide are served from the app")
  func pages() throws {
    let home = try #require(site.file(for: SiteFiles.home))
    #expect(home.lastPathComponent == "index.html")
    let guideAddress = try #require(URL(string: "oneday://localhost/guide/"))
    let guide = try #require(site.file(for: guideAddress))
    #expect(guide.deletingLastPathComponent().lastPathComponent == "guide")
    let script = try #require(URL(string: "oneday://localhost/app.js"))
    #expect(site.file(for: script) != nil)
  }

  @Test(
    "Nothing outside the site is served",
    arguments: [
      "oneday://localhost/../Info.plist",
      "oneday://localhost/%2E%2E/Info.plist",
      "oneday://localhost/guide/../../Info.plist",
      "oneday://localhost/no-such-file.js",
      "oneday://localhost/guide",
      "oneday://elsewhere/index.html",
      "https://localhost/index.html",
    ])
  func outside(address: String) throws {
    let url = try #require(URL(string: address))
    #expect(site.file(for: url) == nil)
  }

  @Test("A missing file gets the site's own 404 page")
  func missing() throws {
    let url = try #require(URL(string: "oneday://localhost/no-such-file"))
    let answer = site.answer(for: url)
    #expect(answer.status == 404)
    #expect(answer.type.hasPrefix("text/html"))
  }

  @Test(
    "Each kind of file says what it is",
    arguments: [
      ("app.js", "text/javascript; charset=utf-8"),
      ("app.css", "text/css; charset=utf-8"),
      ("index.html", "text/html; charset=utf-8"),
      ("icon.svg", "image/svg+xml"),
      ("archivo.woff2", "font/woff2"),
      ("manifest.webmanifest", "application/manifest+json; charset=utf-8"),
    ])
  func types(name: String, type: String) {
    #expect(SiteFiles.mimeType(for: URL(fileURLWithPath: "/site/\(name)")) == type)
  }
}
