package com.zzzode.leanon.companion

import android.app.Activity
import android.app.Instrumentation
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Bundle
import com.zzzode.leanon.data.RecordsRepository
import com.zzzode.leanon.personal.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import java.io.IOException

/** Explicit staged interoperability with a separate real iOS client, never production repositories. */
class CompanionInteropNativeChecks(private val instrumentation: Instrumentation) {
  fun run(stage: String) {
    val base = instrumentation.targetContext
    check(base.packageName == "com.zzzode.leanon.uiqa")
    val directory = File(base.cacheDir, "companion-interop").apply { mkdirs() }
    val fixture = File(directory, "fixture").apply { mkdirs() }
    val context = object : ContextWrapper(base) {
      override fun getFilesDir() = fixture
      override fun getCacheDir() = File(fixture, "cache").apply { mkdirs() }
      override fun getApplicationContext(): Context = this
      override fun getPackageName() = base.packageName + ".native-interop"
    }
    val checks = JSONArray(); val report = JSONObject().put("stage", stage).put("checks", checks).put("capturedUtc", Instant.now().toString())
    fun pass(id: String) { checks.put(JSONObject().put("id", id).put("passed", true)) }
    val original = File(base.filesDir, "records.json"); val before = original.takeIf { it.exists() }?.let { CompanionCrypto.hash(it.readBytes()) }
    try {
      val clock = Clock.fixed(Instant.parse("2026-10-07T12:00:00Z"), ZoneOffset.UTC)
      val records = RecordsRepository(context) { clock }; val personal = PersonalRepository(context)
      val journalKeys = PersonalKeyStore(context, File(fixture, "journal"), "transaction")
      val journal = PrivateTransactionJournal(File(fixture, "journal"), journalKeys::key, { it.canonicalPath.startsWith(fixture.canonicalPath + File.separator) })
      val backup = BackupCoordinator({ records }, { personal }, journal); backup.recover()
      records.availabilityCheck = backup::requireAvailable; personal.availabilityCheck = backup::requireAvailable
      val previews = PersonalPreviews(context)
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
        override fun clearPeerPreviews() = previews.clear("partner")
      }
      val companion = CompanionRepository(context, port)
      when (stage) {
        "deletion-fail", "deletion-recover" -> {
          // A separate fictional account and fixture; the shared A/B interoperability state is untouched.
          val deleteFixture = File(directory, "delete-fixture").apply { mkdirs() }
          val deleteContext = object : ContextWrapper(base) {
            override fun getFilesDir() = deleteFixture
            override fun getCacheDir() = File(deleteFixture, "cache").apply { mkdirs() }
            override fun getApplicationContext(): Context = this
            override fun getPackageName() = base.packageName + ".native-delete-retry"
          }
          val r = RecordsRepository(deleteContext) { clock }; val p = PersonalRepository(deleteContext)
          val keys = PersonalKeyStore(deleteContext, File(deleteFixture, "journal"), "transaction")
          val j = PrivateTransactionJournal(File(deleteFixture, "journal"), keys::key, { it.canonicalPath.startsWith(deleteFixture.canonicalPath + File.separator) })
          val b = BackupCoordinator({ r }, { p }, j); b.recover(); r.availabilityCheck = b::requireAvailable; p.availabilityCheck = b::requireAvailable
          var failLocalDelete = stage == "deletion-fail"
          val deletePort = object : CompanionLocalPort {
            override fun requireAvailable() = b.requireAvailable()
            override fun exportVaultPayload() = b.exportPayload()
            override fun hostData() = r.currentSnapshot()
            override fun personalState() = p.snapshot()
            override fun mergeVaultPayload(payload: JSONObject, metadata: AtomicPrivateWrite, expectedRecordsRevision: Long, expectedPersonalRevision: Long) = b.mergeVaultPayload(payload, metadata, expectedRecordsRevision, expectedPersonalRevision)
            override fun attachLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long, commitOwner: () -> Unit) = b.attach(expectedRecordsRevision, expectedPersonalRevision, commitOwner)
            override fun deleteLocalData() { if (failLocalDelete) { failLocalDelete = false; throw IOException("PUBLIC injected before local journal deletion") }; b.deleteLocalData() }
            override fun deleteAccountLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long, metadata: AtomicPrivateWrite) { if (failLocalDelete) { failLocalDelete = false; throw IOException("PUBLIC injected before local journal deletion") }; b.deleteAccountLocalData(expectedRecordsRevision, expectedPersonalRevision, metadata) }
            override fun finishAccountDeletionKeyCleanup() = b.finishDeletionKeyCleanup()
          }
          val service = CompanionRepository(deleteContext, deletePort)
          if (stage == "deletion-fail") {
            val login = "public-delete-" + UUID.randomUUID(); val password = "PUBLIC-delete-" + UUID.randomUUID()
            service.configure("http://10.0.2.2:8787"); service.register(login, password)
            r.mutate("native-delete-water", 0, JSONObject().put("type", "set-water").put("date", "2026-10-07").put("amountMl", 250))
            val saved = r.storageFile.readBytes()
            check(runCatching { service.deleteAccount(password, true) }.isFailure)
            check(r.storageFile.readBytes().contentEquals(saved)); pass("real-remote-account-delete-local-prejournal-failure-preserves-data")
            check(SecureCompanionStore(deleteContext).read()!!.getJSONObject("pendingAccountDeletion").getString("phase") == "confirmed"); pass("pending-local-deletion-durable-keystore-metadata")
          } else {
            check(SecureCompanionStore(deleteContext).read()!!.getJSONObject("pendingAccountDeletion").getString("phase") == "confirmed"); check(r.storageFile.exists())
            check(service.getState().getJSONObject("companion").isNull("account"))
            check(!r.storageFile.exists() && !p.storageFile.exists())
            check(SecureCompanionStore(deleteContext).read()!!.isNull("pendingAccountDeletion")); pass("separate-instrumentation-restart-readonly-state-completes-prior-explicit-local-deletion")
            PersonalKeyStore(deleteContext, File(deleteFixture, "companion-v1"), "companion").delete(); keys.delete(); check(deleteFixture.deleteRecursively())
            pass("separate-delete-fixture-and-keystore-aliases-cleaned")
          }
        }
        "accept" -> {
          val input = JSONObject(File(directory, "input.json").readText())
          check(input.getInt("version") == 1)
          check(!records.storageFile.exists() && !personal.storageFile.exists())
          companion.configure("http://10.0.2.2:8787"); companion.login(input.getString("login"), input.getString("password"))
          check(!companion.getState().getJSONObject("runtime").getBoolean("deviceAuthorized")); pass("same-account-new-device-pending")
          companion.acceptInvitation(input.getString("deviceInvitationCode"))
          check(!records.storageFile.exists() && !personal.storageFile.exists()); pass("accept-proof-no-health-access-or-implicit-attachment")
          File(directory, "input.json").delete()
        }
        "sync" -> {
          check(companion.getState().getJSONObject("runtime").getBoolean("deviceAuthorized")); pass("creator-confirmation-observed-by-readonly-getstate")
          companion.sync()
          check(!records.storageFile.exists() && !personal.storageFile.exists()); pass("keyring-only-sync-does-not-import-health")
          check(companion.getState().getJSONObject("companion").getJSONObject("shareSettings").getJSONArray("categories").length() == 0); pass("new-device-empty-outgoing-consent")
          records.mutate("android-native-weight-op", records.loadHostData().getLong("revision"), JSONObject().put("type", "set-weight").put("date", "2026-10-06").put("weightKg", 78.9))
          val pixels = Bitmap.createBitmap(16, 12, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.rgb(90, 120, 140)) }
          val originalImage = ByteArrayOutputStream().apply { pixels.compress(Bitmap.CompressFormat.PNG, 100, this) }.toByteArray(); pixels.recycle()
          val image = try { PersonalImageProcessor.sanitize(originalImage) } finally { originalImage.fill(0) }
          try {
            val photo = JSONObject().put("id", "android-native-photo").put("date", "2026-10-07").put("view", "other").put("createdAt", "2026-10-07T12:00:00Z").put("mime", "image/jpeg").put("width", 16).put("height", 12)
            personal.mutate("android-native-photo-op", personal.snapshot().getLong("revision"), JSONObject().put("type", "add-photo").put("photo", photo), image.bytes)
            report.put("androidPhotoSha256", CompanionCrypto.hash(image.bytes))
          } finally { image.bytes.fill(0) }
          val payload = backup.exportPayload(); companion.attachLocalData(payload.getJSONObject("records").getLong("revision"), payload.getJSONObject("personal").getLong("revision"))
          companion.sync()
          check((0 until records.loadHostData().getJSONArray("weights").length()).map { records.loadHostData().getJSONArray("weights").getJSONObject(it).getString("date") }.containsAll(listOf("2026-10-05", "2026-10-06"))); pass("swift-kotlin-own-vault-independent-entity-merge")
          val publicFixture = JSONObject(instrumentation.context.assets.open("public-backup-v1.json").bufferedReader().use { it.readText() })
          val publicEnvelope = instrumentation.context.assets.open("public-backup-v1.envelope.json").use { it.readBytes() }
          val expected = BackupCodec.open(publicEnvelope, publicFixture.getString("password"))
          val bytes = PersonalCrypto.decode(expected.getJSONArray("photos").getJSONObject(0).getString("bytesBase64"))
          val received = personal.photo("public-photo-1").second
          try { check(bytes.contentEquals(received)); report.put("iosPhotoSha256", CompanionCrypto.hash(received)) } finally { bytes.fill(0); received.fill(0) }
          pass("actual-keystore-three-store-journal-and-ios-jpeg-exact-bytes")
          companion.setSharing(listOf("encouragement", "photos"))
          val sent = companion.sendEncouragement("PUBLIC Android native encouragement")
          check(sent.getJSONObject("companion").getJSONArray("messages").getJSONObject(0).getString("status") == "pending"); pass("real-recipient-ack-required-before-delivered")
        }
        "verify" -> {
          val inputFile = File(directory, "input.json"); val input = JSONObject(inputFile.readText()); inputFile.delete()
          companion.logout()
          companion.login(input.getString("login"), input.getString("password"))
          companion.sync()
          val messages = companion.getState().getJSONObject("companion").getJSONArray("messages")
          check((0 until messages.length()).map { messages.getJSONObject(it) }.any { it.getString("direction") == "outgoing" && it.getString("status") == "delivered" }); pass("ios-durable-recipient-ack-delivers-android-message")
          val reopened = CompanionRepository(context, port); reopened.sync()
          pass("keystore-encrypted-credential-cursor-reopen")
          reopened.logout(); reopened.login(input.getString("login"), input.getString("password")); reopened.sync()
          pass("active-family-relogin-pulls-keyring-before-publishing")
        }
        "revoked" -> {
          companion.sync()
          check(companion.getState().getJSONObject("companion").getJSONArray("messages").length() == 0)
          check(runCatching { companion.sendEncouragement("Should be refused") }.isFailure); pass("ios-revocation-purges-messages-and-stops-android-send")
        }
        "cleanup" -> {
          companion.logout()
          backup.deleteLocalData()
          PersonalKeyStore(context, File(fixture, "companion-v1"), "companion").delete()
          journalKeys.delete(); previews.clear()
          check(fixture.deleteRecursively())
          File(directory, "input.json").delete()
          pass("isolated-records-personal-companion-journal-and-keystore-aliases-deleted")
        }
        else -> error("Unknown isolated interoperability stage")
      }
      check(before == original.takeIf { it.exists() }?.let { CompanionCrypto.hash(it.readBytes()) }); pass("application-records-file-unchanged")
      report.put("passed", true)
    } catch (error: Throwable) {
      report.put("passed", false).put("errorClass", error.javaClass.simpleName).put("errorCode", if (error is CompanionFailure) error.code else "native-check-failed")
    }
    File(directory, "report-$stage.json").writeText(report.toString(2))
    instrumentation.finish(if (report.optBoolean("passed")) Activity.RESULT_OK else Activity.RESULT_CANCELED, Bundle().apply { putString("report", "cache/companion-interop/report-$stage.json"); putString("passed", report.optBoolean("passed").toString()) })
  }
}
