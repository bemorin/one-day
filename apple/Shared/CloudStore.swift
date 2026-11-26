@preconcurrency import CloudKit
import Foundation

/// One Day's copy in the person's own iCloud: one record in the private database of One Day's container, holding the
/// same sealed copy as the other clouds (the backup envelope v2 with kind "sync": AES-GCM under a key that a passphrase
/// seals). The page seals, opens and merges it (see "Sync with your cloud" in app.js); the app only reads and writes it,
/// with the iCloud account the device is signed in to. Neither Apple nor One Day can read what is in it.
///
/// The website will reach the same record through CloudKit Web Services once the app is on the App Store: a record
/// type `OneDayCopy`, the record `one-day` in the default zone, the copy as UTF-8 text in its Bytes field `data`.
final class CloudStore {
  static let container = "iCloud.com.bemorin.oneday"
  static let recordType = "OneDayCopy"
  static let recordID = CKRecord.ID(recordName: "one-day")
  static let field = "data"
  /// CloudKit holds at most 1 MB in a record's fields; a little is kept for the record's own.
  static let limit = 1_000_000 - 16_384

  /// Whether this build carries iCloud: a signed build, with the container in its entitlements (ONEDAY_ICLOUD in
  /// project.yml). CloudKit stops an app that asks for a container it isn't entitled to, so a build without it (the
  /// tests on GitHub) never touches CloudKit.
  static var inBuild: Bool {
    Bundle.main.object(forInfoDictionaryKey: "OneDayICloud") as? String == "YES"
  }

  let database: any CloudDatabase

  init(database: any CloudDatabase) {
    self.database = database
  }

  /// The app's own iCloud, or nil in a build without it.
  static func live() -> CloudStore? {
    inBuild ? CloudStore(database: CloudKitDatabase(container: CKContainer(identifier: container))) : nil
  }

  /// What the page is told when something goes wrong, in the words app.js knows (a SyErr's kind).
  nonisolated static func kind(of error: any Error) -> String {
    if let error = error as? CloudError { return error.rawValue }
    guard let error = error as? CKError else { return "http" }
    var code = error.code
    if code == .partialFailure, let inner = error.partialErrorsByItemID?.values.first as? CKError { code = inner.code }
    switch code {
    case .networkUnavailable: return "offline"
    case .networkFailure, .serviceUnavailable: return "unreachable"
    case .notAuthenticated, .accountTemporarilyUnavailable: return "auth"
    case .quotaExceeded: return "full"
    case .requestRateLimited, .zoneBusy: return "slow"
    case .serverRecordChanged: return "conflict"
    case .unknownItem, .zoneNotFound, .userDeletedZone: return "gone"
    case .limitExceeded: return "big"
    case .permissionFailure, .managedAccountRestricted: return "restricted"
    default: return "http"
    }
  }
}

/// A failure the app names itself, in the words app.js knows. `account`: the device is signed in to another account than
/// the one the page syncs with. `http`: something CloudKit refused that waiting won't mend (a record type missing).
nonisolated enum CloudError: String, Error, Sendable {
  case conflict, gone, big, account, http
}

/// The iCloud account the device is signed in to: `available` (with the user's id in One Day's container, the same on
/// every device of that account), `noaccount`, `restricted`, `unavailable` or `unknown`.
nonisolated struct CloudAccount: Sendable, Equatable {
  var status: String
  var user: String
}

/// The copy as it is in iCloud now: its words, and the change tag a write builds on.
nonisolated struct CloudCopy: Sendable, Equatable {
  var tag: String
  var text: String
}

/// What the app asks of iCloud. The tests stand in for CloudKit with one of their own.
protocol CloudDatabase: AnyObject {
  func account() async throws -> CloudAccount
  /// The copy, or nil when there is none.
  func fetch() async throws -> CloudCopy?
  /// Writes the copy over the one whose tag is given (none: a first copy) and returns the new tag. Another copy
  /// written meanwhile is never written over: CloudError.conflict (or CloudKit's serverRecordChanged). With `user`,
  /// only into that account: CloudError.account if the device is signed in to another one.
  func save(_ text: String, over tag: String?, as user: String?) async throws -> String
  /// Erases the copy, with `user` only from that account.
  func delete(as user: String?) async throws
}

/// CloudKit itself: the private database of One Day's container.
final class CloudKitDatabase: CloudDatabase {
  private let container: CKContainer
  /// The record as last read or written: a write builds on it while its tag is still the one asked for.
  private var last: CKRecord?

  init(container: CKContainer) {
    self.container = container
  }

  private var database: CKDatabase { container.privateCloudDatabase }

  func account() async throws -> CloudAccount {
    switch try await container.accountStatus() {
    case .available:
      let user = try await container.userRecordID()
      return CloudAccount(status: "available", user: user.recordName)
    case .noAccount: return CloudAccount(status: "noaccount", user: "")
    case .restricted: return CloudAccount(status: "restricted", user: "")
    case .temporarilyUnavailable: return CloudAccount(status: "unavailable", user: "")
    case .couldNotDetermine: return CloudAccount(status: "unknown", user: "")
    @unknown default: return CloudAccount(status: "unknown", user: "")
    }
  }

  func fetch() async throws -> CloudCopy? {
    guard let record = try await currentRecord() else { return nil }
    return CloudCopy(tag: record.recordChangeTag ?? "", text: Self.text(of: record))
  }

  func save(_ text: String, over tag: String?, as user: String?) async throws -> String {
    let data = Data(text.utf8)
    guard data.count <= CloudStore.limit else { throw CloudError.big }
    try await check(user)
    let record: CKRecord
    if let tag {
      if let last, last.recordChangeTag == tag {
        record = last
      } else {
        guard let now = try await currentRecord() else { throw CloudError.gone }
        guard now.recordChangeTag == tag else { throw CloudError.conflict }
        record = now
      }
    } else {
      record = CKRecord(recordType: CloudStore.recordType, recordID: CloudStore.recordID)
    }
    record[CloudStore.field] = data
    do {
      let (saved, _) = try await database.modifyRecords(
        saving: [record], deleting: [], savePolicy: .ifServerRecordUnchanged, atomically: false)
      guard let result = saved[CloudStore.recordID] else { throw CloudError.http }
      let written = try result.get()
      last = written
      return written.recordChangeTag ?? ""
    } catch {
      // Unknown at a write is not a copy gone (that one is read first): it is the record type missing where the app
      // writes (not yet deployed to production), which reading again won't mend.
      last = nil
      if CloudStore.kind(of: error) == "gone" { throw CloudError.http }
      throw error
    }
  }

  func delete(as user: String?) async throws {
    try await check(user)
    last = nil
    do {
      _ = try await database.deleteRecord(withID: CloudStore.recordID)
    } catch let error as CKError where error.code == .unknownItem {}
  }

  /// The account the page expects, if it says one, must be the one the device is signed in to now.
  private func check(_ user: String?) async throws {
    guard let user, !user.isEmpty else { return }
    guard try await container.userRecordID().recordName == user else { throw CloudError.account }
  }

  private func currentRecord() async throws -> CKRecord? {
    do {
      let record = try await database.record(for: CloudStore.recordID)
      last = record
      return record
    } catch let error as CKError where error.code == .unknownItem {
      last = nil
      return nil
    }
  }

  private static func text(of record: CKRecord) -> String {
    (record[CloudStore.field] as? Data).map { String(decoding: $0, as: UTF8.self) } ?? ""
  }
}
