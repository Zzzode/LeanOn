import Foundation
import UIKit
import CryptoKit

/// Process-wide composition root for native services shared by the container
/// and the Lynx modules. Modules are instantiated by the engine, so they reach
/// these collaborators through this single registry rather than via injection.
/// Later slices add health, notification, scale and sync services here.
final class ServiceRegistry {

  static let shared = ServiceRegistry()

  let recordsStore: RecordsStore
  let personal: PersonalStore
  let photos: PrivatePhotoStore
  let photoPicker: PrivatePhotoPicker
  let backup: BackupCoordinator
  let backupPicker: NativeBackupPicker
  let companion: CompanionService
  private(set) var migration: CompanionMigrationController?
  let events = GlobalEventDispatcher()
  let router = NativeRouter()
  let appearance: AppAppearanceCoordinator
  let reminders: ReminderManager
  let healthKit: HealthKitManager
  let scale: ScaleManager
  private var timeObservers: [NSObjectProtocol] = []
  private var dayTimer: Timer?
  private var recoverProtectedStores: (() throws -> Void)?

  private init() {
    let store = RecordsStore()
    recordsStore = store
    let dispatcher = events
    let personalURL = NativeCapabilityPaths.file("personal").appendingPathExtension("enc")
    let personalAccount = "personal-" + SHA256.hash(data: Data(personalURL.path.utf8)).map { String(format: "%02x", $0) }.joined()
    let collection = PersonalCollection(file: EncryptedAtomicFile(url: personalURL,
      keys: NativeStoreKeys.make(role: .personal, url: personalURL, legacyAccount: personalAccount,
        context: "LeanOn personal v1"), context: "LeanOn personal v1"))
    let personalStore = PersonalStore(collection: collection)
    personal = personalStore
    let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent(personalAccount + "-previews")
    let photoStore = PrivatePhotoStore(collection: collection, cacheDirectory: cache) { scope in
      dispatcher.dispatch("app.photoPreviewsInvalidated",payload:["scope":scope])
    }
    photos = photoStore
    photoPicker = PrivatePhotoPicker(store: personalStore) { state in
      dispatcher.dispatch("personal.changed", payload: ["personal": state])
    }
    let journalURL = NativeCapabilityPaths.file("restore-journal").appendingPathExtension("enc")
    let journal = EncryptedAtomicFile(url: journalURL,
      keys: NativeStoreKeys.make(role: .journal, url: journalURL, legacyAccount: "journal-" + personalAccount,
        context: "LeanOn restore journal v1", maximumBytes: 384 * 1024 * 1024), context: "LeanOn restore journal v1",
      maximumBytes: 384 * 1024 * 1024)
    let coordinator = BackupCoordinator(records: store, personal: personalStore, photos: photoStore, journal: journal,
      clock: RecordsStore.currentTime)
    backup = coordinator
    backupPicker = NativeBackupPicker(coordinator: coordinator, directory: cache.appendingPathComponent("backup-exports"))
    let companionURL = NativeCapabilityPaths.file("companion").appendingPathExtension("enc")
    let companionFile = EncryptedAtomicFile(url: companionURL,
      keys: NativeStoreKeys.make(role: .companion, url: companionURL, legacyAccount: "companion-" + personalAccount,
        context: "LeanOn companion v1", maximumBytes: 128 * 1024 * 1024), context: "LeanOn companion v1",
      maximumBytes: 128 * 1024 * 1024)
    let healthLedgerURL = NativeCapabilityPaths.file("health-kit")
    let healthKeys = NativeStoreKeys.make(role: .healthLedger, url: healthLedgerURL,
      legacyAccount: "health-ledger-" + personalAccount, context: "LeanOn HealthKit ledger v1",
      prefix: Data("LeanOn HealthKit ledger v1 encrypted v1\n".utf8))
    let ledgerPreflight = EncryptedLegacyJSONFile(url: healthLedgerURL, keys: healthKeys, context: "LeanOn HealthKit ledger v1")
    let protectedURLs = [store.encryptedFile.url, personalURL, companionURL, healthLedgerURL]
    let recoverProtectedStores = {
      NativeStoreRecoveryGate.block(protectedURLs)
      do {
      // Authenticate all current roles without provisioning or rewriting before journal recovery.
      try store.encryptedFile.validateCurrentForRecovery()
      try collection.file.validateCurrentForRecovery()
      try companionFile.validateCurrentForRecovery()
      try journal.validateCurrentForRecovery()
      try ledgerPreflight.validateCurrentForRecovery()
      try coordinator.registerParticipant("companion", file: companionFile, recoverImmediately: false)
      try coordinator.preflightRecovery()
      try store.encryptedFile.promoteAuthenticatedKey()
      try collection.file.promoteAuthenticatedKey()
      try companionFile.promoteAuthenticatedKey()
      try journal.promoteAuthenticatedKey()
      try ledgerPreflight.promoteAuthenticatedKey()
      try coordinator.recover()
      NativeStoreRecoveryGate.unblock(protectedURLs)
      } catch {
        NativeStoreRecoveryGate.block(protectedURLs)
        throw error
      }
    }
    self.recoverProtectedStores = recoverProtectedStores
    do { try recoverProtectedStores() } catch {
      NSLog("[LeanOnStore] Startup recovery required; protected stores unavailable")
    }
    func requireHealthDataAvailable() throws {
      guard let bytes = try companionFile.read() else { return }
      guard let document = try JSONSerialization.jsonObject(with: bytes) as? NSDictionary else {
        throw NativeCryptoError.invalidEnvelope
      }
      guard let pending = document["pendingAccountDeletion"], !(pending is NSNull) else { return }
      guard let intent = pending as? NSDictionary else { throw NativeCryptoError.invalidEnvelope }
      if intent["deleteLocalData"] as? Bool == true,
        ["confirmed", "local-complete"].contains(intent["phase"] as? String ?? "") {
        throw HealthKitSyncError.disabled
      }
    }
    var healthForDeletion: HealthKitManager?
    func clearHealthLedger() throws {
      guard let health = healthForDeletion else { throw NativeCryptoError.keyUnavailable }
      let completion = DispatchSemaphore(value: 0)
      var failure: Error?
      let task = Task { do { try await health.clearLocalState() } catch { failure = error }; completion.signal() }
      guard completion.wait(timeout: .now() + 30) == .success else {
        task.cancel()
        // Drain the cancellation before returning; no destructive task can run later after
        // the user changes the pending deletion choice. No record/personal lock is held here.
        completion.wait()
        throw RecordTransactionError.conflict("local sync cleanup pending")
      }
      if let failure { throw failure }
    }
    var adapter = CompanionDataAdapter(
      exportPayload: { try coordinator.exportPayload() as! [String: Any] },
      attach: { recordsRevision, personalRevision, persist in
        try coordinator.attach(expectedRecordsRevision: recordsRevision, expectedPersonalRevision: personalRevision) {
          try persist($0 as! [String: Any])
        }
      },
      commitPayload: { payload, recordsRevision, personalRevision, file, state in
        try coordinator.commitPayload(payload as NSDictionary, expectedRecordsRevision: recordsRevision,
          expectedPersonalRevision: personalRevision, companionFile: file, companionState: state as NSDictionary)
      },
      hostData: { try store.currentSnapshot() }, personal: { try personalStore.snapshot() },
      deleteLocalData: {
        try clearHealthLedger()
        try coordinator.deleteLocalData()
      },
      clearPreviews: { scope in
        if scope == "all" {coordinator.invalidatePreviews()}
        try photoStore.clearDisplayCache(scope:scope)
      })
    adapter.commitAccountDeletion = { recordsRevision, personalRevision, file, state in
      // The HealthKit actor can itself be waiting for the records lock. Quiesce it before
      // acquiring the coordinator's locks; the subsequent dual CAS still protects local rows.
      try clearHealthLedger()
      try coordinator.commitAccountDeletion(expectedRecordsRevision: recordsRevision,
        expectedPersonalRevision: personalRevision, companionFile: file, companionState: state as NSDictionary)
    }
    adapter.finishAccountDeletionCleanup = {
      try coordinator.finishAccountDeletionCleanup {
        // A retry must preserve any newly created ledger and its key, rather than erase it again.
        guard !FileManager.default.fileExists(atPath: healthLedgerURL.path) else {
          throw RecordTransactionError.conflict("local health ledger recreated after account deletion")
        }
      }
    }
    adapter.accountDeletionLocalDataExists = {
      try coordinator.accountDeletionLocalDataExists() || FileManager.default.fileExists(atPath: healthLedgerURL.path)
    }
    adapter.validateAccountDeletionCompletion = {
      try coordinator.validateAccountDeletionCompletion()
      try healthKeys.validateDeletionCompletion()
    }
    companion = CompanionService(storage: CompanionStateFile(file: companionFile), data: adapter,
      now: RecordsStore.currentTime)
    let migrationURL = NativeCapabilityPaths.file("companion-migration")
    let migrationNamespace = (Bundle.main.bundleIdentifier ?? "com.zzzode.leanon") + ".migration-ui." + SHA256.hash(data: Data(migrationURL.path.utf8)).map { String(format: "%02x", $0) }.joined()
    do {
      let target = try CompanionMigrationCollection(directory: migrationURL.deletingPathExtension().appendingPathExtension("target"))
      migration = CompanionMigrationController(source: companion, backup: coordinator, target: target,
        journal: EncryptedAtomicFile(url: migrationURL.appendingPathExtension("cutover.enc"), keys: KeychainDataKey(service: migrationNamespace, account: "journal"), context: "LeanOn migration cutover v1", maximumBytes: 128 * 1024 * 1024),
        control: EncryptedAtomicFile(url: migrationURL.appendingPathExtension("control.enc"), keys: KeychainDataKey(service: migrationNamespace, account: "control"), context: "LeanOn migration control v1"))
      migration?.changed = { payload in dispatcher.dispatch("companion.migrationChanged", payload: payload) }
    } catch { NSLog("[LeanOnMigration] Protected target collection unavailable; source preserved") }
    let reminderService = ReminderManager(
      store: ReminderSettingsStore(url: NativeCapabilityPaths.file("reminders")),
      records: { try store.currentSnapshot() }, clock: RecordsStore.currentTime,
      calendar: RecordsStore.currentCalendar, prefix: NativeCapabilityPaths.reminderPrefix
    )
    reminders = reminderService
    let healthService = HealthKitManager(
      stateURL: healthLedgerURL,
      loadHostData: { try store.withExclusiveAccess { try requireHealthDataAvailable(); return try store.loadSnapshot() } },
      replaceMirrors: { weights, exercises in
        try store.withExclusiveAccess {
          try requireHealthDataAvailable()
          return try store.replaceHealthKitMirrors(weights: weights, exercises: exercises)
        }
      },
      onRecordsChanged: { snapshot in
        dispatcher.dispatch("records.changed", payload: ["hostData": snapshot])
        reminderService.refresh()
      }, now: RecordsStore.currentTime,
      timeZoneProvider: { RecordsStore.currentCalendar().timeZone },
      keys: healthKeys
    )
    healthKit = healthService
    healthForDeletion = healthService
    scale = ScaleManager(driver: CoreBluetoothScaleDriver(), defaults: AppLocale.defaults, recordsStore: store,
      emit: { name, payload in
        dispatcher.dispatch(name, payload: payload)
        if name == "records.changed" { reminderService.refresh(); healthService.onRecordsChanged() }
      })
    appearance = AppAppearanceCoordinator { payload in
      dispatcher.dispatch("app.appearanceChanged", payload: payload)
    }
    timeObservers.append(NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification,
      object: nil, queue: .main) { [weak self] _ in self?.onBackground() })
    for name in [UIApplication.significantTimeChangeNotification,
                 Notification.Name.NSSystemTimeZoneDidChange, Notification.Name.NSCalendarDayChanged] {
      timeObservers.append(NotificationCenter.default.addObserver(forName: name,
        object: nil, queue: .main) { [weak self] _ in self?.onForeground() })
    }
    scheduleDayRefresh()
  }

  func didWriteRecords(_ snapshot: NSDictionary) {
    events.dispatch("records.changed", payload: ["hostData": snapshot])
    reminders.refresh()
    healthKit.onRecordsChanged()
  }

  func onBackground() {
    events.dispatch("app.lifecycle",payload:["state":"background"])
    do {try photos.setPreviewActive(false);try backupPicker.clearTemporaryFiles()}
    catch {NSLog("[LeanOnPersonal] Background preview cleanup deferred")}
  }
  func onForeground() {
    if UIApplication.shared.applicationState != .background {
      do {try photos.setPreviewActive(true)} catch {NSLog("[LeanOnPersonal] Foreground preview cleanup deferred")}
    }
    do {try backupPicker.clearTemporaryFiles()} catch {NSLog("[LeanOnBackup] Export cleanup deferred")}
    do { try recoverProtectedStores?() } catch { NSLog("[LeanOnStore] Recovery deferred") }
    do {
      let snapshot = try recordsStore.currentSnapshot()
      events.dispatch("records.changed", payload: ["hostData": snapshot])
    } catch {
      // Protected data may remain locked. Preserve the last delivered state and retry later.
      NSLog("[LeanOnStore] Foreground records unavailable; preserving current UI state")
    }
    reminders.refresh()
    healthKit.onForeground()
    scheduleDayRefresh()
  }

  func clearPhotoPreviews() {
    do { try photos.clearDisplayCache(); try backupPicker.clearTemporaryFiles() }
    catch { NSLog("[LeanOnPersonal] Preview cleanup unavailable; retrying on foreground") }
  }

  private func scheduleDayRefresh() {
    dayTimer?.invalidate()
    let delay = RecordDayClock.delayUntilNextDay(now: RecordsStore.currentTime(), calendar: RecordsStore.currentCalendar())
    dayTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in self?.onForeground() }
  }
}

enum NativeCapabilityPaths {
  static func file(_ name: String) -> URL {
    #if DEBUG
    if let path = ProcessInfo.processInfo.environment["LEANON_RECORDS_PATH"], !path.isEmpty {
      return URL(fileURLWithPath: path).deletingPathExtension().appendingPathExtension(name + ".json")
    }
    #endif
    return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent(name + ".json")
  }
  static var reminderPrefix: String {
    #if DEBUG
    if let path = ProcessInfo.processInfo.environment["LEANON_RECORDS_PATH"], !path.isEmpty {
      return "leanon.qa.reminder." + URL(fileURLWithPath: path).lastPathComponent + "."
    }
    #endif
    return ReminderPlanner.prefix
  }
}
