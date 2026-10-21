import Foundation
import CryptoKit

/// Separate encrypted collection for authenticated migration republication.
final class CompanionMigrationCollection {
  let records: RecordsStore, personal: PersonalStore, photos: PrivatePhotoStore
  let backup: BackupCoordinator, store: CompanionStateFile, service: CompanionService
  init(directory: URL) throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let namespace = (Bundle.main.bundleIdentifier ?? "com.zzzode.leanon") + ".migration." + SHA256.hash(data: Data(directory.path.utf8)).map { String(format: "%02x", $0) }.joined()
    func key(_ name: String) -> KeychainDataKey { KeychainDataKey(service: namespace, account: name) }
    let records = RecordsStore(recordsURL: directory.appendingPathComponent("records.json"), keys: key("records"))
    let collection = PersonalCollection(file: EncryptedAtomicFile(url: directory.appendingPathComponent("personal.enc"), keys: key("personal"), context: "LeanOn migration personal v1"))
    let personal = PersonalStore(collection: collection)
    let photos = PrivatePhotoStore(collection: collection, cacheDirectory: directory.appendingPathComponent("previews"))
    let backup = BackupCoordinator(records: records, personal: personal, photos: photos,
      journal: EncryptedAtomicFile(url: directory.appendingPathComponent("transaction.enc"), keys: key("transaction"), context: "LeanOn migration transaction v1", maximumBytes: 384 * 1024 * 1024))
    let file = EncryptedAtomicFile(url: directory.appendingPathComponent("companion.enc"), keys: key("companion"), context: "LeanOn migration companion v1", maximumBytes: 128 * 1024 * 1024)
    try backup.registerParticipant("companion", file: file)
    let store = CompanionStateFile(file: file)
    var adapter = CompanionDataAdapter(exportPayload: { try backup.exportPayload() as! [String: Any] },
      attach: { r,p,persist in try backup.attach(expectedRecordsRevision: r, expectedPersonalRevision: p) { try persist($0 as! [String: Any]) } },
      commitPayload: { value,r,p,f,state in try backup.commitPayload(value as NSDictionary, expectedRecordsRevision: r, expectedPersonalRevision: p, companionFile: f, companionState: state as NSDictionary) },
      hostData: { try records.currentSnapshot() }, personal: { try personal.snapshot() }, deleteLocalData: { try backup.deleteLocalData() }, clearPreviews: { _ in try photos.clearDisplayCache() })
    adapter.commitAccountDeletion = { r,p,f,state in try backup.commitAccountDeletion(expectedRecordsRevision: r, expectedPersonalRevision: p, companionFile: f, companionState: state as NSDictionary) }
    adapter.finishAccountDeletionCleanup = { try backup.finishAccountDeletionCleanup() }
    self.records = records; self.personal = personal; self.photos = photos; self.backup = backup; self.store = store
    service = CompanionService(storage: store, data: adapter, now: RecordsStore.currentTime)
  }
}
