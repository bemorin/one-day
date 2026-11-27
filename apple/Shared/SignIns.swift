import Foundation
import Security
import os

/// A sign-in to Google Drive, Dropbox or OneDrive (its tokens), as app.js keeps it. The app keeps it in this device's
/// keychain, and the page writes it neither into its own storage nor into the app's copy of the tasks (saved.json):
/// both go in the device's backups, and a key to the cloud has no place there. The keychain keeps it for this device
/// only: not in iCloud Keychain, and not restored on another device. One at a time: sync goes with one cloud.
protocol SignIns: AnyObject {
  /// The sign-in kept, in the page's own words (JSON), or nil.
  func read() -> String?
  /// Keeps it in place of the one before, or forgets it (nil).
  func keep(_ text: String?)
}

final class KeychainSignIns: SignIns {
  /// The most a sign-in may weigh: its tokens take a few kilobytes at most.
  static let limit = 16_384
  /// The clouds a sign-in may be for (iCloud has none: the device's account is the one).
  static let clouds: Set<String> = ["google", "dropbox", "onedrive"]
  private let service: String
  private let log = Logger(subsystem: "com.bemorin.oneday", category: "signin")

  /// `service`: the keychain item's name, another one in the tests.
  init(service: String = "com.bemorin.oneday.sign-in") {
    self.service = service
  }

  private var item: [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: "cloud",
      // on a Mac too, the keychain an iPhone has: this app's items alone, protected as on the iPhone
      kSecUseDataProtectionKeychain as String: true,
    ]
  }

  func read() -> String? {
    var query = item
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var found: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &found)
    guard status == errSecSuccess, let data = found as? Data else {
      if status != errSecItemNotFound { log.error("The keychain couldn't be read (\(status, privacy: .public))") }
      return nil
    }
    return String(data: data, encoding: .utf8)
  }

  func keep(_ text: String?) {
    guard let text else {
      let status = SecItemDelete(item as CFDictionary)
      if status != errSecSuccess, status != errSecItemNotFound {
        log.error("The keychain couldn't forget the sign-in (\(status, privacy: .public))")
      }
      return
    }
    guard let data = text.data(using: .utf8), Self.isSignIn(data) else {
      log.error("A sign-in that isn't one was not kept")
      return
    }
    let updated = SecItemUpdate(item as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    if updated == errSecSuccess { return }
    guard updated == errSecItemNotFound else {
      log.error("The keychain couldn't keep the sign-in (\(updated, privacy: .public))")
      return
    }
    var add = item
    add[kSecValueData as String] = data
    // Readable once the device has been unlocked after it started, like the app's copy of the tasks (the system may
    // start the app ahead of time, the device still locked); never moved to another device, never in iCloud Keychain.
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    add[kSecAttrSynchronizable as String] = false
    let added = SecItemAdd(add as CFDictionary, nil)
    if added != errSecSuccess { log.error("The keychain couldn't keep the sign-in (\(added, privacy: .public))") }
  }

  /// A sign-in as the page writes one: a JSON object for one of the three clouds, small.
  static func isSignIn(_ data: Data) -> Bool {
    guard data.count <= limit, let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let cloud = object["cloud"] as? String
    else { return false }
    return clouds.contains(cloud)
  }
}
