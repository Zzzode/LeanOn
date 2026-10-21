import Foundation
import HealthKit

/// The only adapter that accesses the system store. Tests inject a fake client.
final class SystemHealthKitClient: HealthKitClient {
  private let store = HKHealthStore()
  private let weight = HKQuantityType.quantityType(forIdentifier: .bodyMass)!
  private let workout = HKObjectType.workoutType()
  var supported: Bool { HKHealthStore.isHealthDataAvailable() }
  var writeAuthorized: Bool {
    isWriteAuthorized(for: .weight) && isWriteAuthorized(for: .workout)
  }
  func isWriteAuthorized(for kind: HealthKitExport.Kind) -> Bool {
    guard supported else { return false }
    return store.authorizationStatus(for: sampleType(kind)) == .sharingAuthorized
  }
  private func sampleType(_ kind: HealthKitExport.Kind) -> HKSampleType {
    if kind == .workout { return workout }
    return HKQuantityType.quantityType(forIdentifier: kind.quantityIdentifier!)!
  }

  func requestPermission() async throws {
    guard supported else { throw HealthKitSyncError.unsupported }
    let healthStore = store
    let weightType = weight
    let workoutType = workout
    let shareTypes = Set(HealthKitExport.Kind.allCases.map { sampleType($0) })
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      DispatchQueue.main.async {
        // Nutrition is write-only. Reading it risks double-counting local meals.
        healthStore.requestAuthorization(toShare: shareTypes, read: [weightType, workoutType]) { completed, error in
          if let error { continuation.resume(throwing: error) }
          else if completed { continuation.resume() }
          else { continuation.resume(throwing: HealthKitSyncError.operationFailed) }
        }
      }
    }
  }

  private func query(type: HKSampleType, since: Date, until: Date) async throws -> [HKSample] {
    guard supported else { throw HealthKitSyncError.unsupported }
    return try await withCheckedThrowingContinuation { continuation in
      let predicate = HKQuery.predicateForSamples(withStart: since, end: until, options: .strictStartDate)
      let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit,
        sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) {
          _, samples, error in
          if let error { continuation.resume(throwing: error) }
          else { continuation.resume(returning: samples ?? []) }
        }
      store.execute(query)
    }
  }

  func readWeights(since: Date, until: Date) async throws -> [HealthKitExternalWeight] {
    try await query(type: weight, since: since, until: until).compactMap { sample in
      guard let item = sample as? HKQuantitySample else { return nil }
      return HealthKitExternalWeight(id: item.uuid.uuidString, date: item.startDate,
        weightKg: item.quantity.doubleValue(for: .gramUnit(with: .kilo)),
        syncIdentifier: item.metadata?[HKMetadataKeySyncIdentifier] as? String,
        sourceBundle: item.sourceRevision.source.bundleIdentifier)
    }
  }

  func readWorkouts(since: Date, until: Date) async throws -> [HealthKitExternalWorkout] {
    try await query(type: workout, since: since, until: until).compactMap { sample in
      guard let item = sample as? HKWorkout else { return nil }
      return HealthKitExternalWorkout(id: item.uuid.uuidString, start: item.startDate, end: item.endDate,
        activity: item.workoutActivityType,
        syncIdentifier: item.metadata?[HKMetadataKeySyncIdentifier] as? String,
        sourceBundle: item.sourceRevision.source.bundleIdentifier,
        indoor: item.metadata?[HKMetadataKeyIndoorWorkout] as? Bool)
    }
  }

  func save(_ record: HealthKitExport, version: Int) async throws {
    guard supported else { throw HealthKitSyncError.unsupported }
    guard isWriteAuthorized(for: record.kind) else { throw HealthKitSyncError.permissionRequired }
    var metadata: [String: Any] = [HKMetadataKeySyncIdentifier: record.id, HKMetadataKeySyncVersion: version]
    if let indoor = record.indoor { metadata[HKMetadataKeyIndoorWorkout] = indoor }
    let object: HKSample
    switch record.kind {
    case .weight:
      guard let kg = record.weightKg else { throw HealthKitSyncError.invalidRecords }
      object = HKQuantitySample(type: weight, quantity: HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: kg),
        start: record.start, end: record.end, metadata: metadata)
    case .workout:
      guard let activity = record.activity else { throw HealthKitSyncError.invalidRecords }
      // External energy is deliberately ignored; the shared MET calculation owns eat-back.
      object = HKWorkout(activityType: activity, start: record.start, end: record.end,
        workoutEvents: nil, totalEnergyBurned: nil, totalDistance: nil, metadata: metadata)
    default:
      guard let value = record.quantityValue else { throw HealthKitSyncError.invalidRecords }
      object = HKQuantitySample(type: sampleType(record.kind) as! HKQuantityType,
        quantity: HKQuantity(unit: record.kind.nutritionUnit, doubleValue: value),
        start: record.start, end: record.end, metadata: metadata)
    }
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      store.save(object) { success, error in
        if let error { continuation.resume(throwing: error) }
        else if success { continuation.resume() }
        else { continuation.resume(throwing: HealthKitSyncError.operationFailed) }
      }
    }
  }

  func delete(id: String, kind: HealthKitExport.Kind) async throws {
    guard supported else { throw HealthKitSyncError.unsupported }
    guard isWriteAuthorized(for: kind), id.hasPrefix("leanon-") else { throw HealthKitSyncError.permissionRequired }
    let type: HKObjectType = sampleType(kind)
    let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [
      HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier, allowedValues: [id]),
      HKQuery.predicateForObjects(from: HKSource.default()),
    ])
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      store.deleteObjects(of: type, predicate: predicate) { success, _, error in
        if let error { continuation.resume(throwing: error) }
        else if success { continuation.resume() }
        else { continuation.resume(throwing: HealthKitSyncError.operationFailed) }
      }
    }
  }
}
