import Foundation

/// Compute the next local day boundary without assuming every day is 24 hours.
enum RecordDayClock {
  static func delayUntilNextDay(now: Date, calendar: Calendar) -> TimeInterval {
    let start = calendar.startOfDay(for: now)
    guard let next = calendar.date(byAdding: .day, value: 1, to: start) else { return 60 }
    return max(1, next.timeIntervalSince(now))
  }
}
