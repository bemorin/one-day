import Foundation
import Observation
import StoreKit
import os

/// "Buy me an 🍎": tips through the App Store, the app's own way of saying "if you want". Each tip is a consumable
/// In-App Purchase that unlocks nothing (One Day is free and stays free): it only says thank you. The ids are here;
/// their names and prices are set in App Store Connect. StoreKit checks each purchase on the device (no server of
/// ours), and the app finishes it. On the website, the footer's coffee goes to Ko-fi instead.
@Observable
final class TipJar {
  /// The tips, as App Store Connect knows them. The sheet lists them from the cheapest.
  static let ids = [
    "com.bemorin.oneday.tip.apple",
    "com.bemorin.oneday.tip.basket",
    "com.bemorin.oneday.tip.pie",
    "com.bemorin.oneday.tip.tree",
    "com.bemorin.oneday.tip.orchard",
  ]

  enum Phase: Equatable {
    case idle, loading, ready, buying(String), thanked, unavailable
  }

  /// Whether the sheet is open (the page's "Buy me an 🍎" opens it).
  var isOpen = false
  private(set) var products: [Product] = []
  private(set) var phase: Phase = .idle
  @ObservationIgnored private var updates: Task<Void, Never>?
  @ObservationIgnored private let log = Logger(subsystem: "com.bemorin.oneday", category: "tips")

  init() {
    // A purchase may end away from the sheet (Ask to Buy approved later, one cut short): it is finished here.
    updates = Task { [weak self] in
      for await result in Transaction.updates {
        await self?.settle(result)
      }
    }
  }

  func open() {
    isOpen = true
    if products.isEmpty, phase != .loading {
      Task { await load() }
    }
  }

  func load() async {
    phase = .loading
    do {
      products = try await Product.products(for: Self.ids).sorted { $0.price < $1.price }
      phase = products.isEmpty ? .unavailable : .ready
    } catch {
      log.error("The tips could not be loaded: \(error.localizedDescription, privacy: .public)")
      phase = .unavailable
    }
  }

  func buy(_ product: Product) async {
    phase = .buying(product.id)
    do {
      switch try await product.purchase() {
      case .success(let result):
        phase = await settle(result) ? .thanked : .ready
      case .userCancelled, .pending:
        phase = .ready
      @unknown default:
        phase = .ready
      }
    } catch {
      log.error("A tip did not go through: \(error.localizedDescription, privacy: .public)")
      phase = .ready
    }
  }

  /// Finishes a purchase StoreKit has verified. One it can't verify is left alone: a tip unlocks nothing anyway.
  @discardableResult
  func settle(_ result: VerificationResult<Transaction>) async -> Bool {
    guard case .verified(let transaction) = result else { return false }
    await transaction.finish()
    return true
  }
}
