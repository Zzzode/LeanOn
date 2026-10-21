package com.zzzode.leanon.companion

import android.app.Activity
import android.app.Instrumentation
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Bundle
import android.os.Process
import com.zzzode.leanon.data.RecordsRepository
import com.zzzode.leanon.personal.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.security.KeyStore
import java.time.Instant
import java.util.UUID

/** Real loopback HTTP and AndroidKeyStore; each stage must run in a different QA process. */
internal class ReceiptProcessNativeChecks(private val instrumentation: Instrumentation) {
  fun run(stage: String, endpoint: String) {
    val base = instrumentation.targetContext
    check(base.packageName == "com.zzzode.leanon.uiqa")
    val uri = java.net.URI(endpoint)
    check(uri.scheme == "http" && uri.host in setOf("127.0.0.1", "10.0.2.2") && uri.port in 1..65535 && uri.path.isEmpty())
    val directory = File(base.cacheDir, "receipt-cross-process")
    val fixture = File(directory, "fixture")
    if (stage == "prepare") check(!directory.exists()) { "An existing receipt fixture must never be overwritten" }
    else check(directory.isDirectory) { "Missing staged receipt fixture" }
    fixture.mkdirs()
    val context = object : ContextWrapper(base) {
      override fun getFilesDir() = fixture
      override fun getCacheDir() = File(fixture, "cache").apply { mkdirs() }
      override fun getApplicationContext(): Context = this
      override fun getPackageName() = "receipt-cross-process.${base.packageName}"
    }
    val originalFiles = listOf("records.json", "personal-v1/state.enc", "companion-v1/state.enc")
    fun hashes() = JSONObject().apply { originalFiles.forEach { put(it, sha(File(base.filesDir, it))) } }
    val originalsBefore = hashes()
    val checks = JSONArray()
    val report = JSONObject().put("stage", stage).put("pid", Process.myPid()).put("utc", Instant.now().toString())
      .put("checks", checks).put("transport", "actual CompanionHttp / loopback TCP")
      .put("keyStore", "actual AndroidKeyStore; exactly namespaced disposable aliases")
    fun pass(id: String) { checks.put(JSONObject().put("id", id).put("passed", true)) }
    val aliases = listOf("records", "personal", "private-transactions", "companion")
      .map { "${context.packageName}.leanon.$it.wrap.v1" }
    try {
      val records = RecordsRepository(context)
      val personal = PersonalRepository(context)
      val journalKeys = PersonalKeyStore(context, File(fixture, "journal"), "private-transactions")
      val journal = PrivateTransactionJournal(File(fixture, "journal"), journalKeys::key,
        { it.canonicalPath.startsWith(fixture.canonicalPath + File.separator) })
      val backup = BackupCoordinator({ records }, { personal }, journal)
      backup.recover()
      records.availabilityCheck = backup::requireAvailable
      personal.availabilityCheck = backup::requireAvailable
      val previews = PersonalPreviews(context)
      var deletionCalls = 0
      var authenticationCalls = 0
      var acknowledgementCalls = 0
      var localDeletionCalls = 0
      val port = object : CompanionLocalPort {
        override fun requireAvailable() = backup.requireAvailable()
        override fun exportVaultPayload() = backup.exportPayload()
        override fun hostData() = records.currentSnapshot()
        override fun personalState() = personal.snapshot()
        override fun mergeVaultPayload(payload: JSONObject, metadata: AtomicPrivateWrite, expectedRecordsRevision: Long, expectedPersonalRevision: Long) =
          backup.mergeVaultPayload(payload, metadata, expectedRecordsRevision, expectedPersonalRevision)
        override fun attachLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long, commitOwner: () -> Unit) =
          backup.attach(expectedRecordsRevision, expectedPersonalRevision, commitOwner)
        override fun deleteLocalData() = backup.deleteLocalData()
        override fun deleteAccountLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long, metadata: AtomicPrivateWrite) {
          localDeletionCalls++
          backup.deleteAccountLocalData(expectedRecordsRevision, expectedPersonalRevision, metadata)
        }
        override fun finishAccountDeletionKeyCleanup() = backup.finishDeletionKeyCleanup()
        override fun clearPeerPreviews() = previews.clear("partner")
      }
      val store = SecureCompanionStore(context)
      val companion = CompanionRepository(store, port, System::currentTimeMillis) { address ->
        val native = CompanionHttp(address)
        object : CompanionTransport {
          override fun request(method: String, path: String, body: JSONObject?, token: String?): JSONObject {
            if (method == "DELETE" && path == "/v1/accounts/current") deletionCalls++
            if (method == "POST" && path == "/v1/sessions") authenticationCalls++
            if (path.endsWith("/ack")) acknowledgementCalls++
            val response = native.request(method, path, body, token)
            // Inject response loss only after the real relay has durably committed the operation.
            if (stage == "prepare" && method == "DELETE" && path == "/v1/accounts/current") throw IOException("QA committed DELETE response loss")
            if (stage == "recover-ack-loss" && path.endsWith("/ack")) throw IOException("QA committed ACK response loss")
            return response
          }
        }
      }
      val metadataFile = File(directory, "staged-metadata.json")
      fun seed(id: String, weight: Double) {
        records.mutate("$id-weight-op", records.currentSnapshot().getLong("revision"), JSONObject()
          .put("type", "set-weight").put("date", "2026-10-07").put("weightKg", weight))
        val bitmap = Bitmap.createBitmap(24, 18, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.GRAY) }
        val raw = ByteArrayOutputStream().apply { bitmap.compress(Bitmap.CompressFormat.PNG, 100, this) }.toByteArray()
        bitmap.recycle()
        val image = try { PersonalImageProcessor.sanitize(raw) } finally { raw.fill(0) }
        try {
          personal.mutate("$id-photo-op", personal.snapshot().getLong("revision"), JSONObject().put("type", "add-photo")
            .put("photo", JSONObject().put("id", "$id-photo").put("date", "2026-10-07").put("view", "other")
              .put("createdAt", Instant.now().toString()).put("mime", "image/jpeg").put("width", 24).put("height", 18)), image.bytes)
        } finally { image.bytes.fill(0) }
      }
      when (stage) {
        "prepare" -> {
          val password = UUID.randomUUID().toString() + UUID.randomUUID().toString()
          companion.configure(endpoint)
          companion.register("qa_receipt_" + UUID.randomUUID().toString().replace("-", ""), password)
          seed("original", 78.4)
          companion.attachLocalData(records.currentSnapshot().getLong("revision"), personal.snapshot().getLong("revision"))
          check(runCatching { companion.deleteAccount(password, true) }.exceptionOrNull() is IOException)
          val intent = store.read()!!.getJSONObject("pendingAccountDeletion")
          check(intent.getString("phase") == "prepared" && !intent.has("password"))
          check(records.storageFile.exists() && File(fixture, "personal-v1/state.enc").exists())
          val receipt = CompanionHttp(endpoint).request("POST", "/v1/account-deletions/${intent.getString("operationId")}/receipt",
            JSONObject().put("proof", intent.getString("proof")))
          CompanionValidation.deletionReceipt(receipt, intent.getString("operationId"), intent.getString("accountId"))
          metadataFile.writeText(JSONObject().put("preparePid", Process.myPid()).toString())
          pass("real-delete-committed-response-lost-durable-prepared-intent-and-local-data-preserved")
        }
        "recover-ack-loss" -> {
          val metadata = JSONObject(metadataFile.readText())
          check(metadata.getInt("preparePid") != Process.myPid())
          val result = companion.getState()
          val runtime = result.getJSONObject("runtime")
          report.put("observedPhase", runtime.optJSONObject("accountDeletion")?.optString("phase"))
            .put("observedErrorCode", runtime.opt("errorCode")).put("localDeletionCalls", localDeletionCalls)
            .put("acknowledgementRequests", acknowledgementCalls)
          check(runtime.getJSONObject("accountDeletion").getString("phase") == "local-complete")
          check(deletionCalls == 0 && authenticationCalls == 0 && localDeletionCalls == 1 && acknowledgementCalls == 1)
          check(!records.storageFile.exists() && !File(fixture, "personal-v1/state.enc").exists())
          val keys = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
          check(listOf(aliases[0], aliases[1]).none(keys::containsAlias))
          check(!File(fixture, "journal/transaction.enc").exists())
          check(File(fixture, "journal").listFiles()?.none { it.name.endsWith(".piece") } != false)
          pass("new-process-receipt-recovery-real-three-store-journal-key-cleanup-and-committed-ack-response-loss")
          seed("new", 77.7)
          metadata.put("ackLossPid", Process.myPid()).put("recordsSha", sha(records.storageFile))
            .put("personalSha", sha(File(fixture, "personal-v1/state.enc")))
          val photo = personal.photo("new-photo").second
          try { metadata.put("photoSha", CompanionCrypto.hash(photo)) } finally { photo.fill(0) }
          metadataFile.writeText(metadata.toString())
          pass("new-fictional-weight-and-photo-created-after-completed-local-cleanup")
        }
        "cleanup-interrupted" -> {
          // Test-harness assertion failure only: complete the already-local-complete receipt first.
          check(store.read()!!.getJSONObject("pendingAccountDeletion").getString("phase") == "local-complete")
          companion.getState()
          check(store.read()!!.isNull("pendingAccountDeletion") && deletionCalls == 0 && authenticationCalls == 0)
          val keys = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
          aliases.forEach { keys.deleteEntry(it) }
          check(fixture.deleteRecursively() && aliases.none(keys::containsAlias))
          metadataFile.delete()
          pass("interrupted-test-harness-fixture-recovered-without-delete-replay-and-cleaned")
        }
        "recover-final" -> {
          val metadata = JSONObject(metadataFile.readText())
          check(metadata.getInt("preparePid") != Process.myPid() && metadata.getInt("ackLossPid") != Process.myPid())
          val result = companion.getState()
          check(result.getJSONObject("runtime").isNull("accountDeletion"))
          check(store.read()!!.isNull("pendingAccountDeletion"))
          check(deletionCalls == 0 && authenticationCalls == 0 && localDeletionCalls == 0 && acknowledgementCalls == 1)
          check(metadata.getString("recordsSha") == sha(records.storageFile))
          check(metadata.getString("personalSha") == sha(File(fixture, "personal-v1/state.enc")))
          val photo = personal.photo("new-photo").second
          try { check(metadata.getString("photoSha") == CompanionCrypto.hash(photo)) } finally { photo.fill(0) }
          pass("third-process-already-committed-ack-retry-never-replays-delete-or-wipes-new-data")
          report.put("preparePid", metadata.getInt("preparePid")).put("ackLossPid", metadata.getInt("ackLossPid"))
          report.put("newRecordsSha256", metadata.getString("recordsSha")).put("newPersonalSha256", metadata.getString("personalSha"))
          val keys = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
          aliases.forEach { keys.deleteEntry(it) }
          check(fixture.deleteRecursively())
          metadataFile.delete()
          check(aliases.none(keys::containsAlias))
          pass("exact-four-disposable-keystore-aliases-and-fixture-cleaned")
        }
        else -> error("Unsupported receipt QA stage")
      }
      check(originalsBefore.toString() == hashes().toString())
      report.put("originalsBefore", originalsBefore).put("originalsAfter", hashes())
      pass("original-qa-records-personal-companion-bytes-unchanged")
      report.put("deleteRequests", deletionCalls).put("sessionRequests", authenticationCalls)
        .put("acknowledgementRequests", acknowledgementCalls).put("localDeletionCalls", localDeletionCalls).put("passed", true)
    } catch (error: Throwable) {
      report.put("passed", false).put("errorClass", error.javaClass.simpleName)
        .put("errorCode", if (error is CompanionFailure) error.code else "native-check-failed")
        .put("nativeCheckLocation", error.stackTrace.firstOrNull()?.toString())
    }
    File(directory, "report-$stage.json").writeText(report.toString(2))
    if (report.optBoolean("passed") && stage in setOf("prepare", "recover-ack-loss")) {
      // Keep the actual producer alive for the explicitly authorized force-stop, bounded to three minutes.
      val deadline = System.nanoTime() + 180_000_000_000L
      while (System.nanoTime() < deadline) Thread.sleep(200)
    }
    instrumentation.finish(if (report.optBoolean("passed")) Activity.RESULT_OK else Activity.RESULT_CANCELED,
      Bundle().apply { putString("report", "cache/receipt-cross-process/report-$stage.json"); putString("passed", report.optBoolean("passed").toString()) })
  }

  private fun sha(file: File): Any = if (file.isFile) CompanionCrypto.hash(file.readBytes()) else JSONObject.NULL
}
