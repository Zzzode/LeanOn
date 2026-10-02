import Foundation

/// App-private JSON record store. The native side is the persistence authority
/// (RFC 0010). On first launch the packaged seed is copied into the Documents
/// directory; each write upserts the record for a date and returns the full
/// HostData snapshot, mirroring the Android RecordsRepository.
///
/// This slice stores plain JSON. Encryption and the envelope/migration model
/// are tracked under RFC 0008 and deliberately not applied here.
final class RecordsStore {

  private let recordsURL: URL

  init() {
    let documents = FileManager.default.urls(
      for: .documentDirectory,
      in: .userDomainMask,
    )[0]
    recordsURL = documents.appendingPathComponent("records.json")
    #if DEBUG
    NSLog("[LeanOnStore] init recordsURL=\(recordsURL.path)")
    #endif
  }

  /// Current HostData as an immutable snapshot, seeding/migrating on first use.
  func loadHostData() -> NSDictionary {
    let data = loadMutableAndMigrate()
    return (data.copy() as? NSDictionary) ?? NSDictionary()
  }

  /// Insert or replace the weight sample for date, persist, and return the
  /// updated HostData. Only today's weight is logged (the latest date), so a new
  /// sample is appended and date ordering is preserved.
  @discardableResult
  func addWeight(date: String, weightKg: Double) -> NSDictionary {
    let data = loadMutableAndMigrate()
    guard let weights = data["weights"] as? NSMutableArray else {
      return (data.copy() as? NSDictionary) ?? NSDictionary()
    }

    var existing = -1
    for (index, item) in weights.enumerated() {
      if let sample = item as? [String: Any], sample["date"] as? String == date {
        existing = index
        break
      }
    }

    let sample: [String: Any] = ["date": date, "weightKg": weightKg]
    if existing >= 0 {
      weights[existing] = sample
    } else {
      weights.add(sample)
    }

    persist(data)
    return (data.copy() as? NSDictionary) ?? NSDictionary()
  }

  // MARK: Loading, seeding and migration

  private func loadMutableAndMigrate() -> NSMutableDictionary {
    ensureSeeded()
    guard let data = readMutable() else {
      // Unreadable store: re-seed from the bundle and load once more.
      #if DEBUG
      NSLog("[LeanOnStore] read failed, re-seeding")
      #endif
      seedFromBundle()
      return readMutable() ?? NSMutableDictionary()
    }

    var changed = false
    if ensureExerciseIds(data) { changed = true }
    if ensureMicros(data) { changed = true }
    if changed { persist(data) }
    return data
  }

  private func readMutable() -> NSMutableDictionary? {
    guard FileManager.default.fileExists(atPath: recordsURL.path) else {
      return nil
    }
    do {
      let raw = try Data(contentsOf: recordsURL)
      let parsed = try JSONSerialization.jsonObject(
        with: raw,
        options: [.mutableContainers],
      )
      return parsed as? NSMutableDictionary
    } catch {
      #if DEBUG
      NSLog("[LeanOnStore] readMutable error=\(error)")
      #endif
      return nil
    }
  }

  /// Ensure every exercise session has a non-empty id (RFC 0018).
  private func ensureExerciseIds(_ data: NSMutableDictionary) -> Bool {
    if data["exercises"] == nil {
      data["exercises"] = NSMutableArray()
    }
    guard let exercises = data["exercises"] as? NSMutableArray else {
      return false
    }
    var changed = false
    for item in exercises {
      guard let session = item as? NSMutableDictionary else { continue }
      let id = session["id"] as? String ?? ""
      if id.isEmpty {
        session["id"] = Self.newExerciseId()
        changed = true
      }
    }
    return changed
  }

  /// Backfill missing micronutrients on intake samples and user foods (RFC 0024).
  private func ensureMicros(_ data: NSMutableDictionary) -> Bool {
    var changed = false
    for key in ["intake", "customFoods"] {
      guard let array = data[key] as? NSMutableArray else { continue }
      for item in array {
        guard let record = item as? NSMutableDictionary else { continue }
        if record["micros"] == nil {
          record["micros"] = Self.zeroMicros()
          changed = true
        }
      }
    }
    return changed
  }

  private func ensureSeeded() {
    let exists = FileManager.default.fileExists(atPath: recordsURL.path)
    #if DEBUG
    NSLog("[LeanOnStore] ensureSeeded exists=\(exists)")
    #endif
    if exists {
      return
    }
    seedFromBundle()
  }

  private func seedFromBundle() {
    guard let url = Bundle.main.url(forResource: "hostData", withExtension: "json") else {
      #if DEBUG
      NSLog("[LeanOnStore] seed hostData.json NOT FOUND in bundle")
      #endif
      return
    }
    do {
      let data = try Data(contentsOf: url)
      try data.write(to: recordsURL, options: .atomic)
      #if DEBUG
      NSLog("[LeanOnStore] seed wrote \(data.count) bytes")
      #endif
    } catch {
      #if DEBUG
      NSLog("[LeanOnStore] seed write error=\(error)")
      #endif
    }
  }

  private func persist(_ object: Any) {
    do {
      let raw = try JSONSerialization.data(withJSONObject: object)
      try raw.write(to: recordsURL, options: .atomic)
      #if DEBUG
      NSLog("[LeanOnStore] persist wrote \(raw.count) bytes")
      #endif
    } catch {
      #if DEBUG
      NSLog("[LeanOnStore] persist error=\(error)")
      #endif
    }
  }

  private static func zeroMicros() -> NSDictionary {
    [
      "fiberG": 0,
      "sugarG": 0,
      "saturatedFatG": 0,
      "sodiumMg": 0,
    ]
  }

  private static func newExerciseId() -> String {
    let stem = UUID().uuidString.replacingOccurrences(of: "-", with: "")
    return "ex-\(stem.prefix(8))"
  }
}
