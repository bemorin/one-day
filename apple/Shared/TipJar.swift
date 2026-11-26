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
  private(set) var choices: [Tip] = []
  private(set) var phase: Phase = .idle
  @ObservationIgnored private let store: any TipStore
  @ObservationIgnored private let log = Logger(subsystem: "com.bemorin.oneday", category: "tips")

  init(store: any TipStore = AppStoreTips()) {
    self.store = store
  }

  func open() {
    isOpen = true
    if choices.isEmpty, phase != .loading {
      Task { await load() }
    }
  }

  func load() async {
    phase = .loading
    do {
      choices = try await store.tips(for: Self.ids).sorted { $0.price < $1.price }
      phase = choices.isEmpty ? .unavailable : .ready
    } catch {
      log.error("The tips could not be loaded: \(error.localizedDescription, privacy: .public)")
      phase = .unavailable
    }
  }

  func buy(_ tip: Tip) async {
    phase = .buying(tip.id)
    do {
      phase = try await store.buy(tip.id) == .thanked ? .thanked : .ready
    } catch {
      log.error("A tip did not go through: \(error.localizedDescription, privacy: .public)")
      phase = .ready
    }
  }
}

/// One tip, as the sheet shows it.
nonisolated struct Tip: Sendable, Equatable, Identifiable {
  var id: String
  var name: String
  var price: Decimal
  var displayPrice: String
}

/// What buying a tip came to. Only a purchase StoreKit has verified, and the app has finished, says thank you.
nonisolated enum TipOutcome: Sendable, Equatable {
  case thanked, cancelled, pending, unverified
}

/// Where the tips come from: the App Store in the app, a stand-in in the tests (StoreKit's own test store doesn't run
/// on GitHub's Macs).
protocol TipStore: AnyObject {
  func tips(for ids: [String]) async throws -> [Tip]
  func buy(_ id: String) async throws -> TipOutcome
}

/// The App Store, through StoreKit 2.
final class AppStoreTips: TipStore {
  private var products: [String: Product] = [:]
  private var updates: Task<Void, Never>?

  init() {
    // A purchase may end away from the sheet (Ask to Buy approved later, one cut short): it is finished here.
    updates = Task {
      for await result in Transaction.updates {
        if case .verified(let transaction) = result { await transaction.finish() }
      }
    }
  }

  func tips(for ids: [String]) async throws -> [Tip] {
    let found = try await Product.products(for: ids)
    products = Dictionary(found.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    return found.map { Tip(id: $0.id, name: $0.displayName, price: $0.price, displayPrice: $0.displayPrice) }
  }

  func buy(_ id: String) async throws -> TipOutcome {
    guard let product = products[id] else { return .cancelled }
    switch try await product.purchase() {
    case .success(let result):
      // one StoreKit can't verify unlocks nothing anyway: it is left alone
      guard case .verified(let transaction) = result else { return .unverified }
      await transaction.finish()
      return .thanked
    case .userCancelled:
      return .cancelled
    case .pending:
      return .pending
    @unknown default:
      return .cancelled
    }
  }
}
