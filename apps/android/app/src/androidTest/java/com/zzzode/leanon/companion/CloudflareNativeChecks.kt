package com.zzzode.leanon.companion

import android.app.Activity
import android.app.Instrumentation
import android.content.Context
import android.content.ContextWrapper
import android.os.Bundle
import com.zzzode.leanon.data.RecordsRepository
import com.zzzode.leanon.personal.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

/** Actual Android Keystore, Bitmap and transaction journal; isolated cache only. */
class CloudflareNativeChecks(private val instrumentation: Instrumentation) {
  private data class Client(val context: Context, val records: RecordsRepository, val personal: PersonalRepository, val backup: BackupCoordinator, val companion: CompanionRepository, val journalKeys: PersonalKeyStore, val createRepository: () -> CompanionRepository)
  fun run(endpoint: String) {
    val base = instrumentation.targetContext
    check(base.packageName == "com.zzzode.leanon.uiqa" && endpoint in listOf("http://10.0.2.2:64037", "http://10.0.2.2:64043"))
    val root = File(base.cacheDir, "cloudflare-native-synthetic").apply { check(!exists() || listFiles()?.isEmpty() == true); mkdirs() }
    val checks = JSONArray(); val report = JSONObject().put("checks", checks).put("capturedUtc", Instant.now().toString())
    fun pass(id: String) { checks.put(JSONObject().put("id", id).put("passed", true)) }
    fun client(name: String, losePhotoReply: Boolean = false, clientEndpoint: String = endpoint): Client {
      val dir = File(root, name).apply { mkdirs() }
      val context = object : ContextWrapper(base) {
        override fun getFilesDir() = dir
        override fun getCacheDir() = File(dir, "cache").apply { mkdirs() }
        override fun getApplicationContext(): Context = this
        override fun getPackageName() = base.packageName + ".cloudflareqa." + name
      }
      val records = RecordsRepository(context) { Clock.fixed(Instant.parse("2026-10-07T12:00:00Z"), ZoneOffset.UTC) }
      val personal = PersonalRepository(context)
      val keys = PersonalKeyStore(context, File(dir, "journal"), "transaction")
      val journal = PrivateTransactionJournal(File(dir, "journal"), keys::key, { it.canonicalPath.startsWith(dir.canonicalPath + File.separator) })
      val backup = BackupCoordinator({ records }, { personal }, journal); backup.recover(); records.availabilityCheck = backup::requireAvailable; personal.availabilityCheck = backup::requireAvailable
      val port = object : CompanionLocalPort {
        override fun requireAvailable() = backup.requireAvailable()
        override fun exportVaultPayload() = backup.exportPayload()
        override fun hostData() = records.currentSnapshot()
        override fun personalState() = personal.snapshot()
        override fun mergeVaultPayload(payload: JSONObject, metadata: AtomicPrivateWrite, expectedRecordsRevision: Long, expectedPersonalRevision: Long) = backup.mergeVaultPayload(payload, metadata, expectedRecordsRevision, expectedPersonalRevision)
        override fun attachLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long, commitOwner: () -> Unit) = backup.attach(expectedRecordsRevision, expectedPersonalRevision, commitOwner)
        override fun deleteLocalData() = backup.deleteLocalData()
        override fun deleteAccountLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long, metadata: AtomicPrivateWrite) = backup.deleteAccountLocalData(expectedRecordsRevision, expectedPersonalRevision, metadata)
        override fun finishAccountDeletionKeyCleanup() = backup.finishDeletionKeyCleanup()
      }
      var failures = if (losePhotoReply) 1 else 0; val uploaded = mutableMapOf<String, ByteArray>()
      val factory = { CompanionRepository(SecureCompanionStore(context), port, System::currentTimeMillis) { url -> object : CompanionTransport {
        private val real = CompanionHttp(url)
        override fun request(method: String, path: String, body: JSONObject?, token: String?) = real.request(method, path, body, token)
        override fun binary(method: String, path: String, bytes: ByteArray?, token: String): ByteArray {
          if (method == "PUT" && bytes != null) { uploaded[path]?.let { check(it.contentEquals(bytes)); pass("retry-reuses-identical-photo-ciphertext") } ?: run { uploaded[path] = bytes.copyOf() } }
          val response = real.binary(method, path, bytes, token)
          if (method == "PUT" && failures > 0) { failures--; throw IOException("PUBLIC injected lost photo response") }
          return response
        }
      } }
      }
      val service = factory(); service.configure(clientEndpoint); return Client(context, records, personal, backup, service, keys, factory)
    }
    val clients = mutableListOf<Client>(); val password = "PUBLIC fictional Cloudflare password 2026"
    try {
      if (endpoint.endsWith(":64043")) {
        val a = client("legacy-owner", clientEndpoint="http://10.0.2.2:64041").also(clients::add)
        val b = client("legacy-partner", clientEndpoint="http://10.0.2.2:64041").also(clients::add)
        val ta = client("target-owner", true).also(clients::add)
        val tb = client("target-partner").also(clients::add)
        val d = client("target-device").also(clients::add)
        a.companion.register("migration-owner",password); b.companion.register("migration-partner",password)
        val fixture = JSONObject(instrumentation.context.assets.open("public-backup-v1.json").bufferedReader().use {it.readText()})
        val envelope = instrumentation.context.assets.open("public-backup-v1.envelope.json").use {it.readBytes()}
        fun attach(c:Client) {val value=c.backup.exportPayload();c.companion.attachLocalData(value.getJSONObject("records").getLong("revision"),value.getJSONObject("personal").getLong("revision"))}
        for(c in listOf(a,b)){val p=c.backup.inspect(envelope,fixture.getString("password"));c.backup.restore(p.getString("token"),p.getLong("expectedRecordsRevision"),p.getLong("expectedPersonalRevision"));attach(c);c.companion.sync()}
        val family=a.companion.createInvitation("family").getString("invitationCode");b.companion.acceptInvitation(family);a.companion.confirmInvitation(CompanionCrypto.parseInvitationCode(family).first);b.companion.getState()
        for(c in listOf(a,b))c.companion.setSharing(listOf("photos","exact_weight"))
        val operation="PUBLIC-cloudflare-cutover-01";val backupPassword="PUBLIC encrypted cutover backup 2026"
        for(c in listOf(a,b))CompanionCloudflareMigration.prepare(c.companion,SecureCompanionStore(c.context),c.backup,CompanionCutoverJournal(c.context),endpoint,operation,backupPassword)
        check(CompanionHttp("http://10.0.2.2:64042").request("POST","/v1/prepare",JSONObject()).getString("status")=="prepared");pass("legacy-opaque-preflight-refusal-writes-no-target-data")
        val oldState=SecureCompanionStore(a.context).read()!!;val oldPayload=a.backup.exportPayload()
        val injected=runCatching {CompanionCloudflareMigration.publish(CompanionCutoverJournal(a.context),SecureCompanionStore(ta.context),ta.backup,ta.createRepository,password,backupPassword)}.exceptionOrNull(); report.put("injectedErrorType",injected?.javaClass?.simpleName).put("cutoverPhase",CompanionCutoverJournal(a.context).read()!!.getString("phase"));check(injected!=null)
        check(CompanionCutoverJournal(a.context).read()!!.getString("phase")=="publishing");check(SecureCompanionStore(a.context).read()!!.getString("endpoint")=="http://10.0.2.2:64041");check(personalCanonical(JSONObject(a.backup.exportPayload().toString()).apply {remove("createdAt")})==personalCanonical(JSONObject(oldPayload.toString()).apply {remove("createdAt")}));pass("interrupted-cutover-preserves-original-collection-and-encrypted-journal")
        CompanionCloudflareMigration.publish(CompanionCutoverJournal(a.context),SecureCompanionStore(ta.context),ta.backup,ta.createRepository,password,backupPassword)
        CompanionCloudflareMigration.publish(CompanionCutoverJournal(b.context),SecureCompanionStore(tb.context),tb.backup,tb.createRepository,password,backupPassword)
        val targetState=SecureCompanionStore(ta.context).read()!!;check(targetState.getJSONObject("session").getString("accountId")==oldState.getJSONObject("session").getString("accountId"));check(targetState.getJSONObject("session").getLong("vaultEpoch")==2L);pass("both-legacy-identities-republished-under-new-key-and-epoch")
        val owner=ta.createRepository();val partner=tb.createRepository();owner.sync();partner.sync();val expected=oldPayload.getJSONArray("photos").getJSONObject(0)
        val peer=partner.getPeerPhoto(expected.getString("id")).second;try{check(CompanionCrypto.encode(peer)==expected.getString("bytesBase64"))}finally{peer.fill(0)};pass("migrated-mutual-sharing-decrypts-independent-r2-photo")
        d.companion.login("migration-owner",password);val code=owner.createInvitation("device").getString("invitationCode");d.companion.acceptInvitation(code);owner.confirmInvitation(CompanionCrypto.parseInvitationCode(code).first);d.companion.sync();attach(d);d.companion.sync()
        val recovered=d.backup.exportPayload();check(recovered.getJSONArray("photos").getJSONObject(0).getString("bytesBase64")==expected.getString("bytesBase64"));check(recovered.getJSONObject("records").getJSONArray("weights").toString()==oldPayload.getJSONObject("records").getJSONArray("weights").toString());fun health(v: JSONObject): String {
          val snapshot = JSONObject(v.toString())
          snapshot.remove("createdAt")
          snapshot.getJSONObject("records").remove("revision")
          snapshot.getJSONObject("personal").remove("revision")
          return personalCanonical(snapshot)
        }
        check(health(recovered) == health(oldPayload));pass("fresh-approved-device-recovers-complete-migrated-health-backup")
        check(CompanionCutoverJournal(a.context).read()!!.getString("phase")=="complete");pass("durable-native-and-server-cutover-completion")
        report.put("passed",true)
      } else {
      val a = client("owner", true).also(clients::add)
      val b = client("partner").also(clients::add)
      val d = client("device").also(clients::add)
      a.companion.register("cloudflare-owner", password, "o".repeat(43)); b.companion.register("cloudflare-partner", password, "p".repeat(43))
      check(!a.records.storageFile.exists() && !a.personal.storageFile.exists()); pass("registration-never-attaches-health-data")
      val fixture = JSONObject(instrumentation.context.assets.open("public-backup-v1.json").bufferedReader().use { it.readText() })
      val envelope = instrumentation.context.assets.open("public-backup-v1.envelope.json").use { it.readBytes() }
      val preview = a.backup.inspect(envelope, fixture.getString("password")); a.backup.restore(preview.getString("token"), preview.getLong("expectedRecordsRevision"), preview.getLong("expectedPersonalRevision"))
      fun attach(c: Client) { val value = c.backup.exportPayload(); c.companion.attachLocalData(value.getJSONObject("records").getLong("revision"), value.getJSONObject("personal").getLong("revision")) }
      attach(a); check(runCatching { a.companion.sync() }.isFailure); check(SecureCompanionStore(a.context).read()!!.getJSONArray("outbox").toString().contains("_photoPackets")); pass("lost-photo-response-retains-durable-encrypted-outbox")
      a.companion.sync(); val expected = a.backup.exportPayload().getJSONArray("photos").getJSONObject(0)
      val family = a.companion.createInvitation("family").getString("invitationCode"); b.companion.acceptInvitation(family); a.companion.confirmInvitation(CompanionCrypto.parseInvitationCode(family).first); b.companion.getState()
      a.companion.setSharing(listOf("photos", "encouragement")); b.companion.setSharing(listOf("encouragement")); a.companion.sync(); b.companion.sync()
      val peerBytes = b.companion.getPeerPhoto(expected.getString("id")).second; try { check(CompanionCrypto.encode(peerBytes) == expected.getString("bytesBase64")) } finally { peerBytes.fill(0) }; pass("actual-private-r2-jpeg-decryption-and-bitmap-validation")
      a.companion.sendEncouragement("PUBLIC native Cloudflare encouragement"); b.companion.sync(); check(a.companion.sync().getJSONObject("companion").getJSONArray("messages").getJSONObject(0).getString("status") == "delivered"); pass("durable-receive-before-encouragement-ack")
      d.companion.login("cloudflare-owner", password); check(!d.companion.getState().getJSONObject("runtime").getBoolean("deviceAuthorized"))
      val offer = a.companion.createInvitation("device").getString("invitationCode"); d.companion.acceptInvitation(offer); a.companion.confirmInvitation(CompanionCrypto.parseInvitationCode(offer).first)
      d.companion.sync(); check(!d.records.storageFile.exists() && !d.personal.storageFile.exists()); attach(d); d.companion.sync()
      check(d.backup.exportPayload().getJSONArray("photos").getJSONObject(0).getString("bytesBase64") == expected.getString("bytesBase64")); pass("new-device-key-pairing-and-explicit-photo-recovery")
      a.companion.setSharing(listOf("encouragement")); b.companion.sync(); check(runCatching { b.companion.getPeerPhoto(expected.getString("id")) }.isFailure); pass("photo-consent-revocation-clears-native-cache")
      a.companion.unlink(); check(b.companion.getState().getJSONObject("companion").isNull("binding"))
      runCatching { a.companion.deleteAccount(password, false) }; repeat(24) { if (SecureCompanionStore(a.context).read()?.optJSONObject("pendingAccountDeletion") != null) a.companion.getState() }
      check(a.companion.getState().getJSONObject("companion").isNull("account")); check(SecureCompanionStore(a.context).read()!!.isNull("pendingAccountDeletion")); check(a.records.storageFile.exists() && a.personal.storageFile.exists()); pass("remote-object-cleanup-receipt-ack-preserves-chosen-local-data")
      report.put("passed", true)
      }
    } catch (error: Throwable) { report.put("passed", false).put("errorType", error.javaClass.simpleName).put("errorFrame", error.stackTrace.firstOrNull()?.let { it.className + ":" + it.lineNumber }) }
    finally {
      for (c in clients) { runCatching { c.companion.logout() }; runCatching { c.backup.deleteLocalData() }; runCatching { PersonalKeyStore(c.context, File(c.context.filesDir, "companion-v1"), "companion").delete() }; runCatching { c.journalKeys.delete() }; runCatching { CompanionCutoverJournal(c.context).deleteFixture() } }
      val filesRemoved = root.deleteRecursively()
      val keyStore = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
      val retainedKeys = keyStore.aliases().toList().any { it.startsWith(base.packageName + ".cloudflareqa.") }
      if (filesRemoved && !root.exists() && !retainedKeys) pass("isolated-fixture-files-and-keystore-keys-removed")
      else report.put("passed", false).put("errorType", "FixtureCleanupIncomplete")
    }
    val output = File(base.cacheDir, "cloudflare-native-report.json"); output.writeText(report.toString(2))
    instrumentation.finish(if (report.optBoolean("passed")) Activity.RESULT_OK else Activity.RESULT_CANCELED, Bundle().apply { putString("passed", report.optBoolean("passed").toString()); putString("report", "cache/cloudflare-native-report.json") })
  }
}
