import AuthenticationServices
import Foundation
import os

/// What the sign-in sheet does, for CloudBridge (and the tests' stand-in).
protocol SignInOpening: AnyObject {
  /// The cloud's page at `url`, until the cloud sends you back: the address it sends you to.
  func open(_ url: URL) async throws -> URL
  /// Closes the sheet, if one is open.
  func cancel()
}

nonisolated enum SignInError: Error, Sendable {
  /// Not one of the clouds' sign-in pages.
  case refused
  /// Closed by its own button, without signing in.
  case closed
  /// It couldn't open, or ended without an answer.
  case failed
}

/// Signing in to Google Drive, Dropbox or OneDrive from the app (app.js, "Sync with your cloud"). The cloud's own page
/// opens in the system's sign-in sheet: the browser's, never the app's web view, where Google refuses to sign in. The
/// cloud sends you back to One Day's page on its website, https://day.bemorin.com/oauth/, the address each cloud already
/// knows, and the sheet hands that address to the app instead of opening it. It does so only for an app that the
/// website names as its own (its apple-app-site-association file lists the app for webcredentials, and the app's
/// entitlements name day.bemorin.com). The page reads the cloud's answer in that address, as the website's oauth/ page
/// reads it, and takes it only if it answers the sign-in it started.
final class SignInSheet: NSObject, SignInOpening {
  /// The sign-in pages the app opens, and nothing else.
  static let pages: Set<String> = ["accounts.google.com", "www.dropbox.com", "login.microsoftonline.com"]
  /// Where the clouds send you back.
  static let backHost = "day.bemorin.com"
  static let backPath = "/oauth/"

  /// The window the sheet stands over.
  var anchor: () -> ASPresentationAnchor? = { nil }
  private var session: ASWebAuthenticationSession?
  private let log = Logger(subsystem: "com.bemorin.oneday", category: "signin")

  /// A cloud's sign-in page, over HTTPS, as app.js builds it.
  static func allows(_ url: URL) -> Bool {
    guard url.scheme?.lowercased() == "https", let host = url.host()?.lowercased() else { return false }
    return pages.contains(host) && url.port == nil && url.user() == nil && url.password() == nil
  }

  func open(_ url: URL) async throws -> URL {
    guard Self.allows(url) else { throw SignInError.refused }
    // one sheet at a time: a new sign-in closes the one before
    session?.cancel()
    let address: URL = try await withCheckedThrowingContinuation { continuation in
      let reply = Reply(continuation)
      let sheet = ASWebAuthenticationSession(url: url, callback: .https(host: Self.backHost, path: Self.backPath)) {
        @Sendable sentTo, error in
        if let sentTo {
          reply.send(.success(sentTo))
        } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
          reply.send(.failure(SignInError.closed))
        } else {
          reply.send(.failure(SignInError.failed))
        }
      }
      sheet.presentationContextProvider = self
      // The browser's own cookies: signed in to the cloud there, a sign-in asks only which account. That is what makes
      // signing in again bearable where a cloud gives no lasting sign-in (Google, every hour).
      sheet.prefersEphemeralWebBrowserSession = false
      session = sheet
      if !sheet.start() {
        log.error("The sign-in sheet didn't open")
        reply.send(.failure(SignInError.failed))
      }
    }
    // only ever One Day's own address, as the sheet was told; anything else is no answer
    guard address.scheme?.lowercased() == "https", address.host()?.lowercased() == Self.backHost else {
      throw SignInError.failed
    }
    return address
  }

  func cancel() {
    session?.cancel()
    session = nil
  }
}

extension SignInSheet: ASWebAuthenticationPresentationContextProviding {
  // The system asks on the main thread.
  nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    MainActor.assumeIsolated { anchor() ?? ASPresentationAnchor() }
  }
}

/// One answer for one sign-in, whichever comes first: the sheet's, or its failing to open.
private nonisolated final class Reply: Sendable {
  private let waiting: OSAllocatedUnfairLock<CheckedContinuation<URL, any Error>?>

  init(_ continuation: CheckedContinuation<URL, any Error>) {
    waiting = OSAllocatedUnfairLock(initialState: continuation)
  }

  func send(_ result: Result<URL, any Error>) {
    waiting.withLock { continuation in
      continuation?.resume(with: result)
      continuation = nil
    }
  }
}
