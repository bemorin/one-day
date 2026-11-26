import Foundation
import Testing

@testable import OneDay

/// The App Store as the tips see it, in memory: the tips it holds, and what buying one comes to.
final class FakeTips: TipStore {
  var held: [Tip] = [
    Tip(id: "com.bemorin.oneday.tip.tree", name: "An apple tree", price: 9.99, displayPrice: "9,99 €"),
    Tip(id: "com.bemorin.oneday.tip.apple", name: "An apple", price: 0.99, displayPrice: "0,99 €"),
    Tip(id: "com.bemorin.oneday.tip.orchard", name: "An orchard", price: 19.99, displayPrice: "19,99 €"),
    Tip(id: "com.bemorin.oneday.tip.basket", name: "A basket of apples", price: 2.99, displayPrice: "2,99 €"),
    Tip(id: "com.bemorin.oneday.tip.pie", name: "An apple pie", price: 4.99, displayPrice: "4,99 €"),
  ]
  var outcome = TipOutcome.thanked
  var failure: (any Error)?
  private(set) var asked: [[String]] = []
  private(set) var bought: [String] = []

  func tips(for ids: [String]) async throws -> [Tip] {
    asked.append(ids)
    if let failure { throw failure }
    return held.filter { ids.contains($0.id) }
  }

  func buy(_ id: String) async throws -> TipOutcome {
    bought.append(id)
    if let failure { throw failure }
    return outcome
  }
}

nonisolated struct StoreDown: Error {}

@Suite("Tips through the App Store")
struct TipJarTests {
  let store = FakeTips()

  @Test("The tips come from the cheapest; one bought says thank you")
  func tip() async throws {
    let tips = TipJar(store: store)
    await tips.load()
    #expect(tips.choices.map(\.id) == TipJar.ids)
    #expect(tips.phase == .ready)
    let apple = try #require(tips.choices.first)
    await tips.buy(apple)
    #expect(store.bought == ["com.bemorin.oneday.tip.apple"])
    #expect(tips.phase == .thanked)
  }

  @Test("A purchase cancelled, waiting for approval, or one StoreKit can't verify, says no thank you", arguments: [TipOutcome.cancelled, .pending, .unverified])
  func notThanked(outcome: TipOutcome) async throws {
    store.outcome = outcome
    let tips = TipJar(store: store)
    await tips.load()
    await tips.buy(try #require(tips.choices.first))
    #expect(tips.phase == .ready)
  }

  @Test("No tips from the store, or no store at all: the sheet says they aren't available")
  func unavailable() async {
    store.held = []
    let none = TipJar(store: store)
    await none.load()
    #expect(none.phase == .unavailable)
    store.failure = StoreDown()
    let down = TipJar(store: store)
    await down.load()
    #expect(down.phase == .unavailable)
  }

  @Test("Opening the sheet asks the store once")
  func open() async throws {
    let tips = TipJar(store: store)
    tips.open()
    #expect(tips.isOpen)
    try await eventually { tips.phase == .ready }
    tips.open()
    #expect(store.asked.count == 1)
  }
}
