import XCTest
@testable import LeanOn

final class RecordDayClockTests: XCTestCase {
  func testNextDayAcrossShortAndLongDaylightSavingDays() throws {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "America/New_York"))
    let dates = ISO8601DateFormatter()
    XCTAssertEqual(RecordDayClock.delayUntilNextDay(now: try XCTUnwrap(dates.date(from: "2026-03-08T05:00:00Z")), calendar: calendar), 23 * 3600)
    XCTAssertEqual(RecordDayClock.delayUntilNextDay(now: try XCTUnwrap(dates.date(from: "2026-11-01T04:00:00Z")), calendar: calendar), 25 * 3600)
  }

  func testTimeZoneChangesRecomputeTheBoundary() throws {
    let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-10-06T23:30:00Z"))
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    XCTAssertEqual(RecordDayClock.delayUntilNextDay(now: now, calendar: calendar), 30 * 60)
    calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "Asia/Shanghai"))
    XCTAssertEqual(RecordDayClock.delayUntilNextDay(now: now, calendar: calendar), 16.5 * 3600)
  }
  #if DEBUG
  func testExplicitQAClockFixtureRequiresValidInstantAndKnownZone() throws {
    let clock = RecordsStore.parseQAClock(try JSONSerialization.data(withJSONObject: ["now": "2026-10-07T00:30:00Z", "timeZone": "America/Los_Angeles"]))
    XCTAssertEqual(clock?.zone.identifier, "America/Los_Angeles")
    XCTAssertEqual(clock?.now, ISO8601DateFormatter().date(from: "2026-10-07T00:30:00Z"))
    for value: [String: Any] in [["now": "not-a-date", "timeZone": "UTC"], ["now": "2026-10-07T00:30:00Z", "timeZone": "not-a-zone"], ["now": true, "timeZone": "UTC"]] {
      XCTAssertNil(RecordsStore.parseQAClock(try JSONSerialization.data(withJSONObject: value)))
    }
  }
  #endif
}
