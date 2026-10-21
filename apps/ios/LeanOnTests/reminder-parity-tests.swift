import XCTest
import UserNotifications
import ObjectiveC.runtime
@testable import LeanOn

final class ReminderParityTests: XCTestCase {
  private func url() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathComponent("reminders.json") }
  private func date(_ raw: String) -> Date { ISO8601DateFormatter().date(from: raw)! }
  private var calendar: Calendar { var value = Calendar(identifier: .gregorian); value.timeZone = TimeZone(secondsFromGMT: 0)!; return value }

  func testSettingsPersistAndReloadWithTimes() throws {
    let store = ReminderSettingsStore(url: url())
    defer { try? FileManager.default.removeItem(at: store.url.deletingLastPathComponent()) }
    XCTAssertEqual(try store.load(), .defaults)
    let changed = NativeReminderSettings(weight: try ReminderSlot(enabled: false, hour: 8, minute: 0), meals: try ReminderSlot(enabled: true, hour: 22, minute: 0))
    try store.save(changed)
    XCTAssertEqual(try ReminderSettingsStore(url: store.url).load(), changed)
  }

  func testWrongTypesAndOutOfRangeNeverBecomeSettings() {
    for slot: [String: Any] in [
      ["enabled": 1, "hour": 7, "minute": 30], ["enabled": true, "hour": true, "minute": 30],
      ["enabled": true, "hour": 7.5, "minute": 30], ["enabled": true, "hour": 24, "minute": 0],
      ["enabled": true, "hour": 7, "minute": -1], ["enabled": "true", "hour": 7, "minute": 30]
    ] { XCTAssertThrowsError(try ReminderSlot(slot as NSDictionary)) }
  }

  func testSmartSilenceUsesLocalDatesAndFiniteHorizon() {
    let records: NSDictionary = ["weights": [["date": "2026-10-06", "weightKg": 80]], "intake": []]
    let plan = ReminderPlanner.plan(settings: .defaults, records: records, now: date("2026-10-06T06:00:00Z"), calendar: calendar)
    XCTAssertEqual(plan.count, 55)
    XCTAssertFalse(plan.contains { $0.identifier == "leanon.reminder.weight.2026-10-06" })
    XCTAssertEqual(plan.first?.kind, "meals")
    XCTAssertEqual(plan.last?.date, date("2026-11-02T21:00:00Z"))
  }

  func testPassedSlotsAndDisabledKindsAreNotScheduled() throws {
    let settings = NativeReminderSettings(weight: try ReminderSlot(enabled: true, hour: 7, minute: 30), meals: try ReminderSlot(enabled: false, hour: 21, minute: 0))
    let plan = ReminderPlanner.plan(settings: settings, records: [:], now: date("2026-10-06T10:00:00Z"), calendar: calendar)
    XCTAssertEqual(plan.count, 27)
    XCTAssertEqual(plan.first?.date, date("2026-10-07T07:30:00Z"))
  }

  func testDeniedPermissionDoesNotPersistOrSchedule() throws {
    let store = ReminderSettingsStore(url: url()); let client = FakeReminderClient(); client.granted = false
    let manager = ReminderManager(store: store, client: client, records: { [:] })
    let done = expectation(description: "Denied")
    manager.update(.defaults) { result in
      guard case .failure(let error) = result else { XCTFail("Denied update succeeded"); done.fulfill(); return }
      XCTAssertEqual((error as? ReminderFailure)?.code, "not-authorized"); done.fulfill()
    }
    wait(for: [done], timeout: 2)
    XCTAssertFalse(FileManager.default.fileExists(atPath: store.url.path)); XCTAssertTrue(client.requests.isEmpty)
  }

  func testSchedulingFailureRetainsOldPreferencesAndUnrelatedRequests() throws {
    let store = ReminderSettingsStore(url: url()); try store.save(.defaults)
    defer { try? FileManager.default.removeItem(at: store.url.deletingLastPathComponent()) }
    let client = FakeReminderClient(); client.failNext = true
    let unrelated = UNNotificationRequest(identifier: "another.feature", content: UNMutableNotificationContent(), trigger: nil)
    client.requests = [unrelated]
    let changed = NativeReminderSettings(weight: try ReminderSlot(enabled: true, hour: 8, minute: 0), meals: try ReminderSlot(enabled: false, hour: 21, minute: 0))
    let manager = ReminderManager(store: store, client: client, records: { [:] })
    let done = expectation(description: "Failure")
    manager.update(changed) { result in if case .success = result { XCTFail("Scheduling failed but returned success") }; done.fulfill() }
    wait(for: [done], timeout: 2)
    XCTAssertEqual(try store.load(), .defaults); XCTAssertEqual(client.requests.map(\.identifier), ["another.feature"])
  }

  func testWriteFailureRestoresPreviousScheduleAndPreferences() throws {
    let location = url(); let initial = ReminderSettingsStore(url: location); try initial.save(.defaults)
    defer { try? FileManager.default.removeItem(at: location.deletingLastPathComponent()) }
    let store = ReminderSettingsStore(url: location, writer: { _, _ in throw NSError(domain: "disk-full", code: 1) })
    let client = FakeReminderClient()
    client.requests = [UNNotificationRequest(identifier: "leanon.reminder.old", content: UNMutableNotificationContent(), trigger: nil)]
    let changed = NativeReminderSettings(weight: try ReminderSlot(enabled: false, hour: 8, minute: 0), meals: try ReminderSlot(enabled: false, hour: 21, minute: 0))
    let manager = ReminderManager(store: store, client: client, records: { [:] })
    let done = expectation(description: "Disk failure")
    manager.update(changed) { result in if case .success = result { XCTFail("Disk failure returned success") }; done.fulfill() }
    wait(for: [done], timeout: 2)
    XCTAssertEqual(try initial.load(), .defaults); XCTAssertEqual(client.requests.map(\.identifier), ["leanon.reminder.old"])
  }

  func testNotificationVoidExportsHaveRequestAndCallbackArguments() throws {
    for name in ["getSettings", "requestPermission"] {
      let selector = NSSelectorFromString(try XCTUnwrap(NotificationModule.methodLookup[name]))
      XCTAssertEqual(method_getNumberOfArguments(try XCTUnwrap(class_getInstanceMethod(NotificationModule.self, selector))), 4)
    }
  }
}

private final class FakeReminderClient: ReminderNotificationClient {
  var granted = true
  var failNext = false
  var requests: [UNNotificationRequest] = []
  func permission(_ completion: @escaping (Bool) -> Void) { completion(granted) }
  func requestPermission(_ completion: @escaping (Bool, Error?) -> Void) { completion(granted, nil) }
  func pending(_ completion: @escaping ([UNNotificationRequest]) -> Void) { completion(requests) }
  func remove(_ identifiers: [String]) { requests.removeAll { identifiers.contains($0.identifier) } }
  func add(_ request: UNNotificationRequest, completion: @escaping (Error?) -> Void) {
    if failNext { failNext = false; completion(NSError(domain: "schedule", code: 1)) }
    else { requests.removeAll { $0.identifier == request.identifier }; requests.append(request); completion(nil) }
  }
}
