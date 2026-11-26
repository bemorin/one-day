import Foundation
import StoreKit
import StoreKitTest
import Testing

@testable import OneDay

private final class TestBundle {}

/// The tips, against StoreKit's own test store (Tips.storekit holds them as App Store Connect will): no account, no
/// money, every purchase checked by StoreKit as on a device.
@Suite("Tips through the App Store", .serialized)
struct TipJarTests {
  let session: SKTestSession

  init() throws {
    let url = try #require(Bundle(for: TestBundle.self).url(forResource: "Tips", withExtension: "storekit"))
    session = try SKTestSession(contentsOf: url)
    session.disableDialogs = true
    session.clearTransactions()
  }

  @Test("The tips come from the cheapest, and one bought is finished and thanked")
  func tip() async throws {
    let tips = TipJar()
    await tips.load()
    #expect(tips.products.map(\.id) == TipJar.ids)
    #expect(tips.phase == .ready)
    let apple = try #require(tips.products.first)
    await tips.buy(apple)
    #expect(tips.phase == .thanked)
    var unfinished = 0
    for await _ in Transaction.unfinished { unfinished += 1 }
    #expect(unfinished == 0)
  }

  @Test("Opening the sheet loads the tips once")
  func open() async throws {
    let tips = TipJar()
    tips.open()
    #expect(tips.isOpen)
    try await eventually { tips.phase == .ready }
    #expect(tips.products.count == TipJar.ids.count)
  }
}
