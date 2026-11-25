import Foundation
import os

/// What One Day keeps between visits (its tasks in `oneday.v1`, the lock's vault in `oneday.vault`, a few settings),
/// also kept in a file of the app's own. The web view's storage is not the app's: iOS may empty it when the device runs
/// short of space. This file is the copy the app can count on: the page gets it back from here when its own storage is
/// gone or older (see bridge.js). With the lock on, the tasks are in the vault, sealed, here as in the page.
final class SavedState {
  /// A change from the page, numbered in one line: `seq` only ever grows.
  enum Change {
    case set(key: String, value: String, seq: Int)
    case remove(key: String, seq: Int)
    case all(items: [String: String], seq: Int)

    var seq: Int {
      switch self {
      case .set(_, _, let seq), .remove(_, let seq), .all(_, let seq): seq
      }
    }
  }

  /// The number of the last change the file holds.
  private(set) var seq = 0
  private(set) var items: [String: String] = [:]
  let file: URL
  private var dirty = false
  private var pending: Task<Void, Never>?
  private let log = Logger(subsystem: "com.bemorin.oneday", category: "saved")

  /// The app's own copy, in Application Support.
  static let shared = SavedState(
    file: URL.applicationSupportDirectory.appending(path: "One Day", directoryHint: .isDirectory).appending(path: "saved.json")
  )

  init(file: URL) {
    self.file = file
    load()
  }

  /// Takes a change from the page, unless the file already holds a later one.
  func apply(_ change: Change) {
    guard change.seq > seq else { return }
    switch change {
    case .set(let key, let value, _): items[key] = value
    case .remove(let key, _): items[key] = nil
    case .all(let all, _): items = all
    }
    seq = change.seq
    dirty = true
    saveSoon()
  }

  /// Writes what is still waiting: when the app steps back or quits.
  func flush() {
    pending?.cancel()
    pending = nil
    if dirty { save() }
  }

  /// What the page needs before its own code runs (bridge.js reads it): this file's number and keys, and the app.
  func boot(platform: String, version: String) -> String {
    let boot = Boot(platform: platform, version: version, seq: seq, items: items)
    guard let data = try? JSONEncoder().encode(boot), let json = String(data: data, encoding: .utf8) else { return "null" }
    return json
  }

  // Changes come in bursts (a keystroke in a note saves the day): the file is written once they pause.
  private func saveSoon() {
    pending?.cancel()
    pending = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(400))
      guard !Task.isCancelled else { return }
      self?.save()
    }
  }

  private func save() {
    pending = nil
    do {
      try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
      let data = try JSONEncoder().encode(Stored(seq: seq, items: items))
      #if os(iOS)
        try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
      #else
        try data.write(to: file, options: .atomic)
      #endif
      dirty = false
    } catch {
      log.error("The saved copy could not be written: \(error.localizedDescription, privacy: .public)")
    }
  }

  private func load() {
    guard let data = try? Data(contentsOf: file) else { return }
    do {
      let stored = try JSONDecoder().decode(Stored.self, from: data)
      seq = max(0, stored.seq)
      items = stored.items
    } catch {
      // never written over: put aside, so nothing that could still be read is lost
      log.error("The saved copy could not be read: \(error.localizedDescription, privacy: .public)")
      let aside = file.deletingLastPathComponent().appending(path: "saved-unreadable-\(Int(Date().timeIntervalSince1970)).json")
      try? FileManager.default.moveItem(at: file, to: aside)
    }
  }

  private nonisolated struct Stored: Codable, Sendable {
    var seq: Int
    var items: [String: String]
  }

  private nonisolated struct Boot: Encodable, Sendable {
    var platform: String
    var version: String
    var seq: Int
    var items: [String: String]
  }
}
