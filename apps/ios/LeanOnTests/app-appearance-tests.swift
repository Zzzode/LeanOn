import XCTest
import UIKit
import ObjectiveC
@testable import LeanOn

final class AppAppearanceTests: XCTestCase {
  private var suite: String!
  private var defaults: UserDefaults!

  override func setUp() {
    suite = "com.zzzode.leanon.appearance-tests.\(UUID().uuidString)"
    defaults = UserDefaults(suiteName: suite)
  }

  override func tearDown() { defaults.removePersistentDomain(forName: suite) }

  func testDefaultsToSystemAndRestoresEachPreference() {
    let store = AppAppearanceStore(defaults: defaults)
    XCTAssertEqual(store.preference, .system)
    for preference in AppAppearancePreference.allCases {
      store.preference = preference
      XCTAssertEqual(AppAppearanceStore(defaults: defaults).preference, preference)
    }
    defaults.set("sepia", forKey: "leanon.appearance")
    XCTAssertEqual(store.preference, .system)
  }

  func testExplicitPreferenceOverridesSystemAndUnknownSystemFallsBackToLight() {
    XCTAssertEqual(AppAppearancePreference.system.resolve(systemStyle: .dark), .dark)
    XCTAssertEqual(AppAppearancePreference.system.resolve(systemStyle: .light), .light)
    XCTAssertEqual(AppAppearancePreference.system.resolve(systemStyle: .unspecified), .light)
    XCTAssertEqual(AppAppearancePreference.light.resolve(systemStyle: .dark), .light)
    XCTAssertEqual(AppAppearancePreference.dark.resolve(systemStyle: .light), .dark)
  }

  func testEventsFollowPreferenceAndEffectiveChangesWithoutDuplicates() {
    var events: [[String: String]] = []
    let coordinator = AppAppearanceCoordinator(store: AppAppearanceStore(defaults: defaults), systemStyle: .light) { events.append($0) }
    coordinator.systemAppearanceChanged(.dark)
    XCTAssertEqual(events.last, ["preference": "system", "resolved": "dark"])
    coordinator.systemAppearanceChanged(.dark)
    XCTAssertEqual(events.count, 1)
    _ = coordinator.setPreference("light")
    XCTAssertEqual(events.last, ["preference": "light", "resolved": "light"])
    coordinator.systemAppearanceChanged(.dark)
    XCTAssertEqual(events.count, 2)
    _ = coordinator.setPreference("system")
    XCTAssertEqual(events.last, ["preference": "system", "resolved": "dark"])
    XCTAssertNil(coordinator.setPreference("sepia"))
    XCTAssertEqual(events.count, 3)
    XCTAssertEqual(AppAppearanceStore(defaults: defaults).preference, .system)
  }

  func testBridgeRejectsInvalidRequestsAndPersistsSuccessfulResponse() {
    var events: [[String: String]] = []
    let coordinator = AppAppearanceCoordinator(store: AppAppearanceStore(defaults: defaults), systemStyle: .light) { events.append($0) }
    let module = AppModule(appearance: coordinator)
    for params: NSDictionary in [[:], ["preference": true], ["preference": "auto"]] {
      module.setAppearance(params) {
        XCTAssertEqual($0["code"] as? String, "invalid-request")
        XCTAssertNil($0["success"])
      }
    }
    XCTAssertTrue(events.isEmpty)
    let saved = expectation(description: "appearance saved on main thread")
    module.setAppearance(["preference": "dark"]) {
      XCTAssertTrue(Thread.isMainThread)
      XCTAssertEqual($0["success"] as? Bool, true)
      XCTAssertEqual($0["preference"] as? String, "dark")
      XCTAssertEqual($0["resolved"] as? String, "dark")
      saved.fulfill()
    }
    wait(for: [saved], timeout: 3)
    XCTAssertEqual(AppAppearanceStore(defaults: defaults).preference, .dark)
    let loaded = expectation(description: "appearance read")
    module.getAppearance(nil) {
      XCTAssertEqual($0["preference"] as? String, "dark")
      XCTAssertEqual($0["resolved"] as? String, "dark")
      loaded.fulfill()
    }
    wait(for: [loaded], timeout: 3)
  }

  func testPersistedThemeAppliesToWindowBeforeRootMount() {
    let store = AppAppearanceStore(defaults: defaults)
    store.preference = .dark
    let coordinator = AppAppearanceCoordinator(store: store, systemStyle: .light) { _ in
      XCTFail("Attaching the startup window must not emit a change event")
    }
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 402, height: 874))
    coordinator.attach(window)
    XCTAssertNil(window.rootViewController)
    XCTAssertEqual(window.overrideUserInterfaceStyle, .dark)
    XCTAssertEqual(window.backgroundColor, AppResolvedAppearance.dark.canvas)
    XCTAssertEqual(window.tintColor, AppResolvedAppearance.dark.brand)
    XCTAssertEqual(coordinator.snapshot.payload, ["preference": "dark", "resolved": "dark"])
  }

  func testReturningToSystemResolvesAttachedWindowTraitsImmediately() throws {
    let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
    let window = UIWindow(windowScene: scene)
    let expected = scene.traitCollection.userInterfaceStyle == .dark ? AppResolvedAppearance.dark : .light
    let opposite = expected == .dark ? "light" : "dark"
    var events: [[String: String]] = []
    let coordinator = AppAppearanceCoordinator(store: AppAppearanceStore(defaults: defaults)) { events.append($0) }
    coordinator.attach(window)
    XCTAssertEqual(coordinator.setPreference(opposite)?.resolved.rawValue, opposite)
    let restored = try XCTUnwrap(coordinator.setPreference("system"))
    XCTAssertEqual(window.overrideUserInterfaceStyle, .unspecified)
    XCTAssertEqual(restored.resolved, expected)
    XCTAssertEqual(window.backgroundColor, expected.canvas)
    XCTAssertEqual(events.last, ["preference": "system", "resolved": expected.rawValue])
  }

  func testEveryExportAcceptsRequestAndCallbackIncludingVoidRequests() throws {
    for (name, selectorName) in AppModule.methodLookup {
      let method = try XCTUnwrap(class_getInstanceMethod(AppModule.self, NSSelectorFromString(selectorName)), name)
      // Objective-C includes self and _cmd before the typed bridge's two args.
      XCTAssertEqual(method_getNumberOfArguments(method), 4, name)
    }
  }
}
