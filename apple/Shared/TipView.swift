import StoreKit
import SwiftUI

/// The sheet behind "Buy me an 🍎": the tips, from the cheapest, and a thank you. Nothing in it is needed.
struct TipView: View {
  let tips: TipJar
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    VStack(spacing: 18) {
      Text("Buy me an 🍎")
        .font(.title2.weight(.bold))
      Text("One Day is free, and stays free. If it makes your days lighter, a tip says thank you. It unlocks nothing: everything is already yours.")
        .multilineTextAlignment(.center)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
      choices
      Button(tips.phase == .thanked ? "Close" : "Not now") { dismiss() }
        .padding(.top, 4)
    }
    .padding(28)
    .frame(minWidth: 320, maxWidth: 440)
    .tint(Color(red: 0.92, green: 0.06, blue: 0.2))
    .task {
      if tips.products.isEmpty { await tips.load() }
    }
  }

  @ViewBuilder private var choices: some View {
    switch tips.phase {
    case .idle, .loading:
      ProgressView()
        .padding()
    case .unavailable:
      Text("Tips aren’t available right now.")
        .foregroundStyle(.secondary)
        .padding()
    case .thanked:
      Text("Thank you! 🍎")
        .font(.title3.weight(.semibold))
        .padding()
    case .ready, .buying:
      VStack(spacing: 10) {
        ForEach(tips.products, id: \.id) { product in
          Button {
            Task { await tips.buy(product) }
          } label: {
            HStack {
              Text(product.displayName)
              Spacer()
              if case .buying(product.id) = tips.phase {
                ProgressView()
              } else {
                Text(product.displayPrice)
                  .bold()
              }
            }
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity)
          }
          .buttonStyle(.bordered)
          .disabled(tips.phase != .ready)
        }
      }
    }
  }
}
