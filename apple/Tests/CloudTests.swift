@preconcurrency import CloudKit
import Foundation
import Testing

@testable import OneDay

/// iCloud in memory: one record, its change tag a number that grows with each write.
final class FakeCloud: CloudDatabase {
  var copy: CloudCopy?
  var status = CloudAccount(status: "available", user: "_user")
  /// When set, every question fails with it.
  var failure: (any Error)?
  private var writes = 0

  func account() async throws -> CloudAccount {
    if let failure { throw failure }
    return status
  }

  func fetch() async throws -> CloudCopy? {
    if let failure { throw failure }
    return copy
  }

  func save(_ text: String, over tag: String?, as user: String?) async throws -> String {
    if let failure { throw failure }
    if let user, !user.isEmpty, user != status.user { throw CloudError.account }
    guard tag == copy?.tag else { throw CloudError.conflict }
    writes += 1
    copy = CloudCopy(tag: "t\(writes)", text: text)
    return "t\(writes)"
  }

  func delete(as user: String?) async throws {
    if let failure { throw failure }
    if let user, !user.isEmpty, user != status.user { throw CloudError.account }
    copy = nil
  }
}

@Suite("iCloud, as the page asks it")
struct CloudTests {
  let cloud = FakeCloud()
  var bridge: CloudBridge { CloudBridge(store: CloudStore(database: cloud)) }

  @Test("A first copy, then one written over it, then a stale write refused, then erased")
  func copies() async throws {
    let bridge = self.bridge
    let (none, noError) = await bridge.answer(op: "fetch", text: nil, tag: nil)
    #expect(none is NSNull)
    #expect(noError == nil)

    let (first, _) = await bridge.answer(op: "save", text: "one", tag: nil)
    let firstTag = try #require((first as? [String: String])?["tag"])
    let (second, _) = await bridge.answer(op: "save", text: "two", tag: firstTag)
    let secondTag = try #require((second as? [String: String])?["tag"])
    #expect(cloud.copy == CloudCopy(tag: secondTag, text: "two"))

    let (_, stale) = await bridge.answer(op: "save", text: "late", tag: firstTag)
    #expect(stale == "conflict")
    let (_, again) = await bridge.answer(op: "save", text: "anew", tag: nil)
    #expect(again == "conflict")

    let (read, _) = await bridge.answer(op: "fetch", text: nil, tag: nil)
    #expect((read as? [String: String]) == ["tag": secondTag, "text": "two"])

    _ = await bridge.answer(op: "delete", text: nil, tag: nil)
    #expect(cloud.copy == nil)
  }

  @Test("Nothing is written to, or erased from, another account than the one the page syncs with")
  func otherAccount() async throws {
    let bridge = self.bridge
    let (first, _) = await bridge.answer(op: "save", text: "sealed", tag: nil, user: "_user")
    let tag = try #require((first as? [String: String])?["tag"])
    cloud.status = CloudAccount(status: "available", user: "_someone_else")
    let (_, write) = await bridge.answer(op: "save", text: "late", tag: tag, user: "_user")
    #expect(write == "account")
    let (_, erase) = await bridge.answer(op: "delete", text: nil, tag: nil, user: "_user")
    #expect(erase == "account")
    #expect(cloud.copy?.text == "sealed")
  }

  @Test("The account, as the device is signed in to it")
  func account() async {
    cloud.status = CloudAccount(status: "noaccount", user: "")
    let (answer, error) = await bridge.answer(op: "account", text: nil, tag: nil)
    #expect(error == nil)
    #expect((answer as? [String: String]) == ["status": "noaccount", "user": ""])
  }

  @Test("A build without iCloud answers every question with unavailable")
  func noICloud() async {
    let (answer, error) = await CloudBridge(store: nil).answer(op: "fetch", text: nil, tag: nil)
    #expect(answer == nil)
    #expect(error == "unavailable")
  }

  @Test("An unknown question is refused")
  func unknown() async {
    let (_, error) = await bridge.answer(op: "list", text: nil, tag: nil)
    #expect(error == "refused")
  }

  @Test(
    "CloudKit's failures, in the words the page knows",
    arguments: [
      (CKError.Code.networkUnavailable, "offline"),
      (.networkFailure, "unreachable"),
      (.serviceUnavailable, "unreachable"),
      (.notAuthenticated, "auth"),
      (.quotaExceeded, "full"),
      (.requestRateLimited, "slow"),
      (.zoneBusy, "slow"),
      (.serverRecordChanged, "conflict"),
      (.unknownItem, "gone"),
      (.limitExceeded, "big"),
      (.permissionFailure, "restricted"),
      (.internalError, "http"),
    ])
  func kinds(code: CKError.Code, kind: String) {
    #expect(CloudStore.kind(of: CKError(code)) == kind)
  }

  @Test("A failure the bridge passes on")
  func failure() async {
    cloud.failure = CKError(.networkUnavailable)
    let (_, error) = await bridge.answer(op: "fetch", text: nil, tag: nil)
    #expect(error == "offline")
    #expect(CloudStore.kind(of: CloudError.big) == "big")
    #expect(CloudStore.kind(of: CloudError.account) == "account")
    #expect(CloudStore.kind(of: CloudError.http) == "http")
  }
}
