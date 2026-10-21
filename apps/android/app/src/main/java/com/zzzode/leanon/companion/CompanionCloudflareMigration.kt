package com.zzzode.leanon.companion

import android.content.Context
import com.zzzode.leanon.data.writeRecordsAtomically
import com.zzzode.leanon.personal.BackupCodec
import com.zzzode.leanon.personal.BackupCoordinator
import com.zzzode.leanon.personal.PersonalCrypto
import com.zzzode.leanon.personal.PersonalKeyStore
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException

/** Keystore-protected restart journal, separate from both source and target stores.
 * Uses the existing password-encrypted health backup; never exports companion keys. */
internal class CompanionCutoverJournal(context: Context) {
  private val dir = File(context.filesDir, "companion-cutover")
  private val file = File(dir, "journal.enc")
  private val keys = PersonalKeyStore(context, dir, "companion-cutover")
  fun read(): JSONObject? = if (!file.exists()) null else JSONObject(String(PersonalCrypto.localOpen(keys.key(false), file.readText(), "companion-cutover"), Charsets.UTF_8))
  fun write(value: JSONObject) { val bytes = value.toString().toByteArray(); try { writeRecordsAtomically(file, PersonalCrypto.localEnvelope(keys.key(true), bytes, "companion-cutover")) } finally { bytes.fill(0) } }
  fun deleteFixture() { if (file.exists() && !file.delete()) throw IOException("Cutover fixture removal failed"); keys.delete(); dir.delete() }
}
internal object CompanionCloudflareMigration {
  @Synchronized fun prepare(source: CompanionRepository, sourceStore: CompanionStore, backup: BackupCoordinator, journal: CompanionCutoverJournal, target: String, operation: String, backupPassword: String) {
    CompanionHttp.validateEndpoint(target); check(operation.matches(Regex("[A-Za-z0-9_-]{1,128}")))
    journal.read()?.let { check(it.getString("operation") == operation && it.getString("target") == target); return }
    source.sync(); val old = sourceStore.read() ?: throw IOException("Source companion state missing")
    val identity = old.getJSONObject("session"); val account = identity.getString("accountId"); val vault = identity.getString("vaultId")
    check(identity.getBoolean("deviceAuthorized") && old.optString("localDataAccountId") == account && old.getString("endpoint") != target && old.isNull("pendingAccountDeletion"))
    val payload = backup.exportPayload(); if (payload.getJSONArray("photos").length() > 64) throw CompanionFailure("capacity", "Migration photo manifest exceeds capacity")
    val envelope = BackupCodec.seal(payload, backupPassword); val seed = JSONObject(old.toString())
    seed.put("endpoint", target).put("session", JSONObject.NULL).put("localDataAccountId", JSONObject.NULL).put("localDataRealm", JSONObject.NULL).put("family", JSONObject.NULL).put("lastSyncAt", JSONObject.NULL)
    for (field in listOf("vaultMetadata", "groupKeys", "localConsent", "peerData", "peerPhotos", "cursors", "applied", "pendingAcks", "sentHashes", "invitationSecrets")) seed.put(field, JSONObject())
    for (field in listOf("messages", "outbox", "invitations")) seed.put(field, JSONArray())
    fun rotate(value: Any, group: String): String { val key = CompanionCrypto.decode(value,32); try { return CompanionCrypto.encode(CompanionCrypto.hkdf(key, (operation+":"+group).toByteArray(), "leanon-cutover-key-v2".toByteArray())) } finally {key.fill(0)} }
    seed.getJSONObject("accountKeys").put(target+"#"+account, rotate(old.getJSONObject("accountKeys").get(old.getString("endpoint")+"#"+account), vault))
    old.optJSONObject("family")?.let { family -> val group = family.getString("id"); seed.getJSONObject("groupKeys").put(group, rotate(old.getJSONObject("groupKeys").get(group), group)); seed.getJSONObject("localConsent").put(target+"#"+account+"#"+group, old.getJSONObject("localConsent").optJSONArray(old.getString("endpoint")+"#"+account+"#"+group) ?: JSONArray()) }
    try { journal.write(JSONObject().put("version",1).put("phase","prepared").put("operation",operation).put("target",target).put("sourceState",old).put("seed",seed).put("backup",CompanionCrypto.encode(envelope))) } finally {envelope.fill(0)}
  }
  @Synchronized fun publish(journal: CompanionCutoverJournal, targetStore: CompanionStore, targetBackup: BackupCoordinator, targetRepository: () -> CompanionRepository, password: String, backupPassword: String) {
    val saved = journal.read() ?: throw IOException("Cutover journal missing"); if (saved.getString("phase") == "complete") return
    val old = saved.getJSONObject("sourceState"); val original = old.getJSONObject("session"); val seed = saved.getJSONObject("seed"); val endpoint = saved.getString("target"); val operation = saved.getString("operation")
    if (saved.getString("phase") == "prepared") { targetBackup.requireEmptyCutoverTarget(); saved.put("phase","restoring"); journal.write(saved) }
    if (saved.getString("phase") == "restoring") { val envelope = CompanionCrypto.decode(saved.get("backup")); try { val preview = targetBackup.inspect(envelope, backupPassword); targetBackup.restore(preview.getString("token"),preview.getLong("expectedRecordsRevision"),preview.getLong("expectedPersonalRevision")) } finally {envelope.fill(0)}; saved.put("phase","restored"); journal.write(saved) }
    if (targetStore.read() == null || (targetStore.read()!!.optJSONObject("session") == null && targetStore.read()!!.getJSONObject("accountKeys").length() == 0)) targetStore.write(seed)
    val previous = targetStore.read()!!
    if ((previous.optJSONObject("session")?.optLong("expiresAt") ?: 0) <= System.currentTimeMillis()) { val service = targetRepository(); if (previous.optJSONObject("session") != null) service.logout(); service.login(original.getString("login"),password) }
    val current = targetStore.read()!!; val session = current.getJSONObject("session")
    check(session.getString("accountId") == original.getString("accountId") && session.getString("vaultId") == original.getString("vaultId") && session.getBoolean("deviceAuthorized"))
    val http = CompanionHttp(endpoint); val token = session.getString("token"); val me = http.request("GET","/v1/me",token=token)
    check(me.getJSONObject("migration").getString("id") == operation)
    current.put("groupKeys",seed.getJSONObject("groupKeys")).put("localConsent",seed.getJSONObject("localConsent"))
    for (field in listOf("outbox","cursors","pendingAcks")) current.put(field,previous.get(field))
    targetStore.write(current)
    val service = targetRepository()
    if (current.optString("localDataAccountId") != session.getString("accountId")) { val payload = targetBackup.exportPayload(); service.attachLocalData(payload.getJSONObject("records").getLong("revision"),payload.getJSONObject("personal").getLong("revision")) }
    saved.put("phase","publishing"); journal.write(saved); service.sync()
    check(targetStore.read()!!.getJSONArray("outbox").length() == 0)
    val receipt = http.request("POST","/v2/migrations/complete",JSONObject().put("id",operation).put("photoCount",targetBackup.exportPayload().getJSONArray("photos").length()),token)
    check(receipt.getString("id") == operation && receipt.getString("status") == "complete")
    saved.put("phase","complete"); journal.write(saved)
  }
}
