import Foundation
import Testing

@testable import OneDay

@Suite("The app's copy of what the page keeps")
struct SavedStateTests {
  let file = FileManager.default.temporaryDirectory
    .appending(path: "one-day-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
    .appending(path: "saved.json")

  @Test("Changes are taken in order, a late one is left out, and the file keeps them")
  func order() {
    let saved = SavedState(file: file)
    saved.apply(.set(key: "oneday.v1", value: "a", seq: 1))
    saved.apply(.set(key: "oneday.theme", value: "dark", seq: 2))
    saved.apply(.set(key: "oneday.v1", value: "late", seq: 2))
    saved.apply(.remove(key: "oneday.theme", seq: 3))
    #expect(saved.seq == 3)
    #expect(saved.items == ["oneday.v1": "a"])
    saved.flush()
    let again = SavedState(file: file)
    #expect(again.seq == 3)
    #expect(again.items == ["oneday.v1": "a"])
  }

  @Test("All the keys at once replace what was there")
  func all() {
    let saved = SavedState(file: file)
    saved.apply(.set(key: "oneday.theme", value: "dark", seq: 1))
    saved.apply(.all(items: ["oneday.v1": "b", "oneday.vault": "c"], seq: 7))
    #expect(saved.seq == 7)
    #expect(saved.items == ["oneday.v1": "b", "oneday.vault": "c"])
  }

  @Test("An unreadable file is put aside, never written over")
  func unreadable() throws {
    let folder = file.deletingLastPathComponent()
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    try Data("not json".utf8).write(to: file)
    let saved = SavedState(file: file)
    #expect(saved.seq == 0)
    #expect(saved.items.isEmpty)
    let names = try FileManager.default.contentsOfDirectory(atPath: folder.path)
    #expect(names.contains { $0.hasPrefix("saved-unreadable-") })
  }

  @Test("Only the keys the app keeps come back from the file; an unreadable copy goes once a good one is written")
  func kept() throws {
    let folder = file.deletingLastPathComponent()
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    try Data(#"{"seq":3,"items":{"oneday.v1":"a","oneday.signedin":"token","other":"x"}}"#.utf8).write(to: file)
    let saved = SavedState(file: file)
    #expect(saved.items == ["oneday.v1": "a"])
    try Data("not json".utf8).write(to: folder.appending(path: "saved-unreadable-1.json"))
    saved.apply(.set(key: "oneday.theme", value: "dark", seq: 4))
    saved.flush()
    let names = try FileManager.default.contentsOfDirectory(atPath: folder.path)
    #expect(!names.contains { $0.hasPrefix("saved-unreadable-") })
  }

  @Test("A page starts with the file's number, its keys and the app")
  func boot() throws {
    let saved = SavedState(file: file)
    saved.apply(.set(key: "oneday.v1", value: #"{"days":{}}"#, seq: 4))
    let json = saved.boot(platform: "ios", version: "1.0 (1)")
    let parsed = try JSONSerialization.jsonObject(with: Data(json.utf8))
    let object = try #require(parsed as? [String: Any])
    #expect(object["seq"] as? Int == 4)
    #expect(object["platform"] as? String == "ios")
    #expect((object["items"] as? [String: String])?["oneday.v1"] == #"{"days":{}}"#)
  }

  @Test(
    "Only One Day's own keys are kept",
    arguments: [
      ("oneday.v1", true), ("oneday.vault", true), ("oneday.timer", true), ("oneday.theme", true), ("oneday.app", false),
      ("oneday.signedin", false), ("oneday.install", false), ("other", false),
    ])
  func kept(key: String, kept: Bool) {
    #expect(Bridge.isKept(key) == kept)
  }
}
