import SwiftUI

/// One Day for iPhone, iPad and Mac: the day in one window, its copy kept by the app.
@main
struct OneDayApp: App {
  #if os(macOS)
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  #endif

  var body: some Scene {
    #if os(macOS)
      // One window: the day is all there is, and two windows would write over each other's copy.
      Window("One Day", id: "day") {
        DayView(saved: .shared)
          .frame(minWidth: 320, minHeight: 480)
      }
      .defaultSize(width: 820, height: 760)
    #else
      WindowGroup {
        DayView(saved: .shared)
      }
    #endif
  }
}

/// The window's content: the day, edge to edge, its copy written whenever the app steps back.
struct DayView: View {
  let saved: SavedState
  @Environment(\.scenePhase) private var phase

  var body: some View {
    DayWebView(saved: saved)
      .ignoresSafeArea()
      .background(Color("Page").ignoresSafeArea())
      .onChange(of: phase) { _, now in
        if now != .active { saved.flush() }
      }
  }
}

#if os(macOS)
  /// Closing the window ends the app; quitting writes the copy first.
  final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
      true
    }

    func applicationWillTerminate(_ notification: Notification) {
      SavedState.shared.flush()
    }
  }
#endif
