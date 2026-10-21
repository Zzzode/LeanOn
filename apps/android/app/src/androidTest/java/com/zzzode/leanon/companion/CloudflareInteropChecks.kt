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

/** One real Android partner exchanging data with one real iOS owner through the same local workerd. */
class CloudflareInteropChecks(private val instrumentation: Instrumentation) {
  fun run(stage: String) {
    val base = instrumentation.targetContext
    check(base.packageName == "com.zzzode.leanon.uiqa")
    check(stage in listOf("accept", "publish", "verify", "revoke", "cleanup"))
    val directory = File(base.cacheDir, "cloudflare-cross-platform").apply { mkdirs() }
    val fixture = File(directory, "fixture").apply { mkdirs() }
    val context = object : ContextWrapper(base) {
      override fun getFilesDir() = fixture
      override fun getCacheDir() = File(fixture, "cache").apply { mkdirs() }
      override fun getApplicationContext(): Context = this
      override fun getPackageName() = base.packageName + ".cloudflare-cross-platform"
    }
    val checks = JSONArray(); val report = JSONObject().put("stage", stage).put("checks", checks).put("capturedUtc", Instant.now().toString())
    fun pass(id: String) { checks.put(JSONObject().put("id", id).put("passed", true)) }
    val endpoint = "http://10.0.2.2:64045"
    val password = "PUBLIC fictional cross-platform password 2026"
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
      val fetched = mutableListOf<String>()
      val companion = CompanionRepository(SecureCompanionStore(context), port, System::currentTimeMillis) { url -> object : CompanionTransport {
        private val real = CompanionHttp(url)
        override fun request(method: String, path: String, body: JSONObject?, token: String?) = real.request(method, path, body, token)
        override fun binary(method: String, path: String, bytes: ByteArray?, token: String): ByteArray {
          val result = real.binary(method, path, bytes, token)
          if (method == "GET") fetched.add(path)
          return result
        }
      } }
      when (stage) {
        "accept" -> {
          check(!records.storageFile.exists() && !personal.storageFile.exists())
          companion.configure(endpoint); companion.register("cloudflare-partner", password, "p".repeat(43))
          check(CompanionHttp(endpoint).request("GET", "/v1/me", token = SecureCompanionStore(context).read()!!.getJSONObject("session").getString("token")).getInt("protocol") == 2)
          records.mutate("PUBLIC-android-weight", 0, JSONObject().put("type", "set-weight").put("date", "2026-10-07").put("weightKg", 78.9))
          val pixels = Bitmap.createBitmap(16, 12, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.rgb(90, 120, 140)) }
          val originalImage = ByteArrayOutputStream().apply { pixels.compress(Bitmap.CompressFormat.PNG, 100, this) }.toByteArray(); pixels.recycle()
          val image = try { PersonalImageProcessor.sanitize(originalImage) } finally { originalImage.fill(0) }
          try {
            val photo = JSONObject().put("id", "android-native-photo").put("date", "2026-10-07").put("view", "other").put("createdAt", "2026-10-07T12:00:00Z").put("mime", "image/jpeg").put("width", 16).put("height", 12)
            personal.mutate("PUBLIC-android-photo", personal.snapshot().getLong("revision"), JSONObject().put("type", "add-photo").put("photo", photo), image.bytes)
          } finally { image.bytes.fill(0) }
          val payload = backup.exportPayload(); companion.attachLocalData(payload.getJSONObject("records").getLong("revision"), payload.getJSONObject("personal").getLong("revision")); companion.sync()
          val input = File(directory,"input.json"); companion.acceptInvitation(JSONObject(input.readText()).getString("familyCode")); check(input.delete())
          pass("android-independent-partner-account-accepted-ios-family-proof")
        }
        "publish" -> {
          check(!companion.getState().getJSONObject("companion").isNull("binding"))
          companion.setSharing(listOf("photos", "exact_weight", "encouragement")); companion.sync()
          val state = companion.getState().getJSONObject("companion")
          check(state.getJSONObject("peerSnapshot").getDouble("exactWeightKg") == 81.0)
          val received = companion.getPeerPhoto("public-photo-1").second
          val fixtureJson = JSONObject(instrumentation.context.assets.open("public-backup-v1.json").bufferedReader().use { it.readText() })
          val envelope = instrumentation.context.assets.open("public-backup-v1.envelope.json").use { it.readBytes() }
          val expected = BackupCodec.open(envelope, fixtureJson.getString("password")).getJSONArray("photos").getJSONObject(0).getString("bytesBase64")
          try { check(CompanionCrypto.encode(received) == expected); report.put("iosPhotoSha256", CompanionCrypto.hash(received)) } finally { received.fill(0) }
          report.put("androidPhotoSha256", CompanionCrypto.hash(personal.photo("android-native-photo").second))
          check(records.loadHostData().getJSONArray("weights").length() == 1)
          val group = state.getJSONObject("binding").getString("id")
          File(directory,"private-photo-path.json").writeText(JSONObject().put("path",fetched.first { it.contains("/groups/$group/") }).toString())
          pass("ios-to-android-real-weight-and-independent-r2-jpeg-exact-bytes")
          companion.sendEncouragement("PUBLIC Android to iOS encouragement")
          pass("android-to-ios-encrypted-message-published")
        }
        "verify" -> {
          companion.sync(); companion.sync()
          val messages = companion.getState().getJSONObject("companion").getJSONArray("messages")
          check((0 until messages.length()).map { messages.getJSONObject(it) }.any { it.getString("direction") == "outgoing" && it.getString("status") == "delivered" })
          check((0 until messages.length()).map { messages.getJSONObject(it) }.any { it.getString("direction") == "incoming" && it.getString("text") == "PUBLIC iOS to Android encouragement" })
          pass("both-message-directions-and-ios-durable-delivery-ack")
        }
        "revoke" -> {
          companion.sync()
          check(companion.getState().getJSONObject("companion").getJSONObject("peerSnapshot").isNull("exactWeightKg"))
          check(runCatching { companion.getPeerPhoto("public-photo-1") }.isFailure)
          check(SecureCompanionStore(context).read()!!.getJSONObject("peerPhotos").length() == 0)
          val saved = JSONObject(File(directory,"private-photo-path.json").readText())
          val token = SecureCompanionStore(context).read()!!.getJSONObject("session").getString("token")
          check(CompanionHttp(endpoint).request("GET", "/v1/me", token = token).getInt("protocol") == 2)
          val connection = java.net.URI(endpoint + saved.getString("path")).toURL().openConnection() as java.net.HttpURLConnection
          connection.setRequestProperty("Authorization", "Bearer $token"); connection.connectTimeout = 15000; connection.readTimeout = 15000
          try {
            val status = connection.responseCode
            val code = JSONObject(connection.errorStream.bufferedReader().use { it.readText() }).getJSONObject("error").getString("code")
            check((status == 404 && code == "object_unavailable") || (status == 403 && code == "sharing_not_authorized"))
            report.put("revokedPhotoHttpStatus", status).put("revokedPhotoErrorCode", code)
          } finally { connection.disconnect() }
          pass("ios-withdrawal-purges-android-peer-cache-and-worker-denies-prior-photo-url")
          companion.setSharing(emptyList()); pass("android-withdrawal-committed-for-ios-observation")
        }
        "cleanup" -> {
          companion.logout(); backup.deleteLocalData()
          PersonalKeyStore(context,File(fixture,"companion-v1"),"companion").delete(); journalKeys.delete(); previews.clear()
          check(fixture.deleteRecursively()); File(directory,"private-photo-path.json").delete()
          val keyStore = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
          check(keyStore.aliases().toList().none { it.startsWith(context.packageName + ".") })
          pass("cross-platform-fixture-files-and-android-keystore-keys-removed")
        }
      }
      report.put("passed", true)
    } catch(error: Throwable) { report.put("passed",false).put("errorClass",error.javaClass.simpleName).put("errorCode",if(error is CompanionFailure)error.code else "check-failed").put("errorFrame",error.stackTrace.firstOrNull()?.let {it.className+":"+it.lineNumber}) }
    File(directory,"report-$stage.json").writeText(report.toString(2))
    instrumentation.finish(if(report.optBoolean("passed")) Activity.RESULT_OK else Activity.RESULT_CANCELED,Bundle().apply {putString("passed",report.optBoolean("passed").toString())})
  }
}
