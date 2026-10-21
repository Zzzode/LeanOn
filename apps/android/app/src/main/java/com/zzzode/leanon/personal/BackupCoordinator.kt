package com.zzzode.leanon.personal

import com.zzzode.leanon.data.RecordsRepository
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.Instant
import java.util.UUID

/** One native authority for backup preview, CAS and private multi-store replacement. */
internal class BackupCoordinator(
  private val records: () -> RecordsRepository,
  private val personal: () -> PersonalRepository,
  private val journal: PrivateTransactionJournal,
  private val now: () -> Long = System::currentTimeMillis,
  private val elapsedNanos: () -> Long = System::nanoTime,
  private val validateImage: (ByteArray, Int, Int) -> Unit = ::validateDecodedSanitizedJpeg,
) {
  private data class Plan(val payload: JSONObject, val recordsRevision: Long, val personalRevision: Long,
    val recordsPath: String, val personalPath: String, val expiresAt: Long, val deadline: Long)
  private val plans = linkedMapOf<String, Plan>()
  fun recover() = journal.recover()
  fun requireAvailable() = journal.requireAvailable()
  fun invalidatePlans() { synchronized(plans) { plans.clear() } }
  private fun <T> locked(operation: (RecordsRepository, PersonalRepository) -> T): T {
    val r = records(); val p = personal()
    return synchronized(r) { synchronized(p) { journal.requireAvailable(); operation(r, p) } }
  }
  fun requireEmptyCutoverTarget() = locked { r, p -> if (r.storageFile.exists() || p.storageFile.exists()) throw java.io.IOException("Cutover target must be an empty separate collection") }
  fun exportPayload(): JSONObject = locked { r, p -> payload(r.loadHostData(), p.loadCollection()) }
  private fun payload(host: JSONObject, collection: JSONObject): JSONObject {
    val recordState = JSONObject(); for (field in BackupCodec.recordsFields) recordState.put(field, host.get(field))
    val result = JSONObject().put("formatVersion", 1).put("createdAt", Instant.ofEpochMilli(now()).toString()).put("records", recordState)
      .put("personal", collection.getJSONObject("personal"))
    for (field in listOf("customFoods", "favoriteFoodIds", "recentFoodIds")) result.put(field, host.optJSONArray(field) ?: JSONArray())
    val blobs = collection.getJSONObject("photoBytes"); val photos = JSONArray()
    for (id in blobs.keys().asSequence().sorted()) photos.put(JSONObject().put("id", id).put("bytesBase64", blobs.getString(id)))
    result.put("photos", photos); BackupCodec.validate(result); return result
  }
  /** Authenticate first, then decode and validate canonical JPEG bytes without changing entity identity. */
  fun inspect(bytes: ByteArray, password: String): JSONObject {
    val value = BackupCodec.open(bytes, password)
    sanitizeImportedPhotos(value)
    return locked { r, p ->
      val token = UUID.randomUUID().toString(); val recordRevision = r.loadHostData().getLong("revision"); val personalRevision = p.snapshot().getLong("revision")
      val expiry = now() + 300000
      val plan = Plan(value, recordRevision, personalRevision, r.storageFile.canonicalPath, p.storageFile.canonicalPath, expiry, elapsedNanos() + 300000000000L)
      synchronized(plans) {
        plans.entries.removeAll { it.value.deadline <= elapsedNanos() }
        if (plans.size >= 3) plans.remove(plans.keys.first())
        plans[token] = plan
      }
      JSONObject().put("cancelled", false).put("token", token).put("expiresAt", Instant.ofEpochMilli(expiry).toString())
        .put("summary", BackupCodec.preview(value)).put("expectedRecordsRevision", recordRevision).put("expectedPersonalRevision", personalRevision)
    }
  }
  private fun sanitizeImportedPhotos(value: JSONObject) {
    BackupCodec.validate(value)
    val photos = value.getJSONArray("photos"); val metadata = value.getJSONObject("personal").getJSONArray("photos")
    for (i in 0 until photos.length()) {
      val row = photos.getJSONObject(i); val bytes = PersonalCrypto.decode(row.getString("bytesBase64"), maximum = 20 * 1024 * 1024)
      try {
        val descriptor = (0 until metadata.length()).map { metadata.getJSONObject(it) }.first { it.getString("id") == row.getString("id") }
        validateImage(bytes, descriptor.getInt("width"), descriptor.getInt("height"))
      } finally { bytes.fill(0) }
    }
    BackupCodec.validate(value)
  }
  fun restore(token: String, expectedRecordsRevision: Long, expectedPersonalRevision: Long): JSONObject = locked { r, p ->
    personalId(token); personalRevision(expectedRecordsRevision); personalRevision(expectedPersonalRevision)
    val plan = synchronized(plans) { plans[token] } ?: throw PersonalFailure("not-found", "Restore preview no longer exists")
    if (plan.deadline <= elapsedNanos()) { synchronized(plans) { plans.remove(token) }; throw PersonalFailure("not-found", "Restore preview expired") }
    val currentR = r.loadHostData().getLong("revision"); val currentP = p.snapshot().getLong("revision")
    if (currentR != expectedRecordsRevision || currentP != expectedPersonalRevision || currentR != plan.recordsRevision || currentP != plan.personalRevision || r.storageFile.canonicalPath != plan.recordsPath || p.storageFile.canonicalPath != plan.personalPath) throw PersonalFailure("conflict", "Restore preview is stale")
    val incoming = JSONObject(plan.payload.toString()); val host = BackupCodec.hostData(incoming); val collection = BackupCodec.personalCollection(incoming)
    host.put("revision", nextRevision(currentR, host.getLong("revision")))
    collection.getJSONObject("personal").put("revision", nextRevision(currentP, collection.getJSONObject("personal").getLong("revision")))
    commit(r, p, host, collection, null)
    invalidatePlans()
    JSONObject().put("success", true).put("hostData", r.currentSnapshot()).put("personal", p.snapshot())
  }
  private fun nextRevision(current: Long, incoming: Long): Long {
    val previous = maxOf(current, incoming); if (previous >= MAX_PERSONAL_REVISION) personalInvalid("Revision limit reached")
    return previous + 1
  }
  private fun commit(r: RecordsRepository, p: PersonalRepository, host: JSONObject, collection: JSONObject, metadata: AtomicPrivateWrite?) {
    val recordBytes = r.prepareReplacement(host); val personalBytes = p.prepareCollection(collection)
    try {
      val writes = mutableListOf(AtomicPrivateWrite(r.storageFile, recordBytes), AtomicPrivateWrite(p.storageFile, personalBytes))
      metadata?.let { writes.add(it) }; journal.commit(writes)
    } finally { recordBytes.fill(0); personalBytes.fill(0) }
  }
  /** Companion already merges entity clocks; this adapter validates and commits its payload with its cursor. */
  fun mergeVaultPayload(value: JSONObject, metadata: AtomicPrivateWrite, expectedRecordsRevision: Long, expectedPersonalRevision: Long) {
    val incoming = JSONObject(value.toString()); sanitizeImportedPhotos(incoming)
    locked { r, p ->
      val oldHost = r.loadHostData(); val oldCollection = p.loadCollection()
      personalRevision(expectedRecordsRevision); personalRevision(expectedPersonalRevision)
      if (oldHost.getLong("revision") != expectedRecordsRevision || oldCollection.getJSONObject("personal").getLong("revision") != expectedPersonalRevision) throw PersonalFailure("conflict", "Local data changed during sync")
      val host = BackupCodec.hostData(incoming); val collection = BackupCodec.personalCollection(incoming)
      val previousR = oldHost.getLong("revision"); val previousP = oldCollection.getJSONObject("personal").getLong("revision")
      // The shared merge authority already advances both revisions once; never increment again here.
      fun comparable(value: JSONObject): String = personalCanonical(JSONObject(value.toString()).apply {
        put("createdAt", "2000-01-01T00:00:00Z"); getJSONObject("records").put("revision", 0); getJSONObject("personal").put("revision", 0)
      })
      val changed = comparable(incoming) != comparable(payload(oldHost, oldCollection))
      val incomingR = host.getLong("revision"); val incomingP = collection.getJSONObject("personal").getLong("revision")
      if (incomingR < previousR || incomingP < previousP || changed && (incomingR <= previousR || incomingP <= previousP)) personalInvalid("Merged revisions disagree with changed state")
      commit(r, p, host, collection, metadata); invalidatePlans()
    }
  }
  fun attach(expectedRecordsRevision: Long, expectedPersonalRevision: Long, commitOwner: () -> Unit) = locked { r, p ->
    personalRevision(expectedRecordsRevision); personalRevision(expectedPersonalRevision)
    if (r.loadHostData().getLong("revision") != expectedRecordsRevision || p.snapshot().getLong("revision") != expectedPersonalRevision) throw PersonalFailure("conflict", "Local data changed before consent")
    commitOwner()
  }
  /** Account deletion publishes its durable local-cleared marker in the same transaction as the data removal. */
  fun deleteAccountLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long, metadata: AtomicPrivateWrite) = locked { r, p ->
    personalRevision(expectedRecordsRevision); personalRevision(expectedPersonalRevision)
    if (r.loadHostData().getLong("revision") != expectedRecordsRevision || p.snapshot().getLong("revision") != expectedPersonalRevision) {
      throw PersonalFailure("conflict", "Local data changed after account deletion consent")
    }
    journal.commit(listOf(AtomicPrivateWrite(r.storageFile, null), AtomicPrivateWrite(p.storageFile, null),
      AtomicPrivateWrite(File(r.storageFile.parentFile, "health-connect-export-versions.json"), null), metadata))
    invalidatePlans()
    // A cleanup failure cannot undo the committed marker or cause a later retry to wipe records again.
    finishDeletionKeyCleanup()
  }
  fun finishDeletionKeyCleanup() = locked { r, p ->
    val ledger = File(r.storageFile.parentFile, "health-connect-export-versions.json")
    if (r.storageFile.exists() || p.storageFile.exists() || ledger.exists()) {
      throw PersonalFailure("conflict", "New local data must be preserved during deletion cleanup")
    }
    r.eraseStorageKeys(); r.eraseDerivedStorageKeys(); p.eraseStorageKeys(); invalidatePlans()
  }
  fun deleteLocalData() = locked { r, p ->
    // Commit logical deletion before erasing the wrapping keys; a surviving journal can still recover.
    journal.commit(listOf(AtomicPrivateWrite(r.storageFile, null), AtomicPrivateWrite(p.storageFile, null),
      AtomicPrivateWrite(java.io.File(r.storageFile.parentFile, "health-connect-export-versions.json"), null)))
    r.eraseStorageKeys(); r.eraseDerivedStorageKeys(); p.eraseStorageKeys(); invalidatePlans()
  }
}
