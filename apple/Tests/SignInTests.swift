import Foundation
import Security
import Testing

@testable import OneDay

/// The keychain, in memory: what it holds, and how many times the page changed it.
final class FakeSignIns: SignIns {
  var text: String?
  var changes = 0

  func read() -> String? { text }

  func keep(_ text: String?) {
    self.text = text
    changes += 1
  }
}

/// The sign-in sheet, played: the pages it was asked to open, and what it hands back (or how it ends).
final class FakeSheet: SignInOpening {
  var opened: [URL] = []
  var cancels = 0
  var ending: SignInError?
  var back = URL(string: "https://day.bemorin.com/oauth/?code=c1&state=s1")!

  func open(_ url: URL) async throws -> URL {
    opened.append(url)
    if let ending { throw ending }
    return back
  }

  func cancel() { cancels += 1 }
}

@Suite("Signing in to the other clouds")
struct SignInTests {
  @Test(
    "Only the clouds' own sign-in pages open, over HTTPS",
    arguments: [
      ("https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=s", true),
      ("https://www.dropbox.com/oauth2/authorize?client_id=x", true),
      ("https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?x=1", true),
      ("http://accounts.google.com/o/oauth2/v2/auth", false),
      ("https://accounts.google.com:8443/o/oauth2/v2/auth", false),
      ("https://someone@www.dropbox.com/oauth2/authorize", false),
      ("https://dropbox.com/oauth2/authorize", false),
      ("https://www.dropbox.com.example.com/oauth2/authorize", false),
      ("https://day.bemorin.com/oauth/", false),
      ("oneday://localhost/", false),
    ])
  func pages(url: String, opens: Bool) throws {
    #expect(SignInSheet.allows(try #require(URL(string: url))) == opens)
  }

  @Test("The page's sign-in opens the sheet, and gets back the address the cloud sends you to")
  func answered() async throws {
    let sheet = FakeSheet()
    let bridge = CloudBridge(store: nil, sheet: sheet)
    let (back, error) = await bridge.answer(
      op: "signin", text: nil, tag: nil, url: "https://www.dropbox.com/oauth2/authorize?client_id=x&state=s1")
    #expect(error == nil)
    #expect(back as? String == "https://day.bemorin.com/oauth/?code=c1&state=s1")
    #expect(sheet.opened.map { $0.host() } == ["www.dropbox.com"])
  }

  @Test("Any other page is refused before the sheet opens; the sheet closed, or failing, says so")
  func refused() async throws {
    let sheet = FakeSheet()
    let bridge = CloudBridge(store: nil, sheet: sheet)
    let (_, other) = await bridge.answer(op: "signin", text: nil, tag: nil, url: "https://example.com/login")
    #expect(other == "refused")
    let (_, none) = await bridge.answer(op: "signin", text: nil, tag: nil, url: nil)
    #expect(none == "refused")
    #expect(sheet.opened.isEmpty)

    sheet.ending = .closed
    let (_, closed) = await bridge.answer(op: "signin", text: nil, tag: nil, url: "https://www.dropbox.com/oauth2/authorize")
    #expect(closed == "closed")
    sheet.ending = .failed
    let (_, failed) = await bridge.answer(op: "signin", text: nil, tag: nil, url: "https://www.dropbox.com/oauth2/authorize")
    #expect(failed == "signin")

    let (done, _) = await bridge.answer(op: "signin.cancel", text: nil, tag: nil)
    #expect(done as? Bool == true)
    #expect(sheet.cancels == 1)
  }

  @Test("A build without the sheet answers that it can't")
  func noSheet() async {
    let (_, error) = await CloudBridge(store: nil).answer(
      op: "signin", text: nil, tag: nil, url: "https://www.dropbox.com/oauth2/authorize")
    #expect(error == "unavailable")
  }

  @Test(
    "The keychain takes a sign-in for one of the three clouds, small, and nothing else",
    arguments: [
      (#"{"v":1,"cloud":"dropbox","a":"x","ax":1,"r":"y","rx":0,"acct":""}"#, true),
      (#"{"v":1,"cloud":"google","a":"x"}"#, true),
      (#"{"v":1,"cloud":"onedrive","a":"x"}"#, true),
      (#"{"v":1,"cloud":"icloud","a":"icloud"}"#, false),
      (#"{"v":1}"#, false),
      (#"["dropbox"]"#, false),
      ("not json", false),
      (#"{"cloud":"dropbox","a":""# + String(repeating: "x", count: 20_000) + #""}"#, false),
    ])
  func shape(text: String, kept: Bool) {
    #expect(KeychainSignIns.isSignIn(Data(text.utf8)) == kept)
  }

  @Test("The keychain keeps one sign-in, the next in its place, and forgets it")
  func keychain() throws {
    let keychain = KeychainSignIns(service: "com.bemorin.oneday.tests.\(UUID().uuidString)")
    let first = #"{"v":1,"cloud":"dropbox","a":"a1","ax":1,"r":"r1","rx":0,"acct":""}"#
    let next = #"{"v":1,"cloud":"dropbox","a":"a2","ax":2,"r":"r1","rx":0,"acct":""}"#
    keychain.keep(first)
    // A build that isn't signed has no keychain of its own to write to (errSecMissingEntitlement): GitHub's test runs
    // may be such builds. Then there is nothing to check here, and what the app does with the keychain is checked by
    // the page's tests against a stand-in.
    guard let kept = keychain.read() else {
      #expect(Self.unsigned(), "The keychain kept nothing, in a build that has a keychain")
      return
    }
    #expect(kept == first)
    keychain.keep(next)
    #expect(keychain.read() == next)
    keychain.keep("not a sign-in")
    #expect(keychain.read() == next)
    keychain.keep(nil)
    #expect(keychain.read() == nil)
  }

  /// Whether this build is one the keychain refuses (no entitlement to write with).
  static func unsigned() -> Bool {
    let item: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "com.bemorin.oneday.tests.probe.\(UUID().uuidString)",
      kSecAttrAccount as String: "probe",
      kSecUseDataProtectionKeychain as String: true,
    ]
    var add = item
    add[kSecValueData as String] = Data("x".utf8)
    let status = SecItemAdd(add as CFDictionary, nil)
    if status == errSecSuccess { SecItemDelete(item as CFDictionary) }
    return status == errSecMissingEntitlement
  }
}
