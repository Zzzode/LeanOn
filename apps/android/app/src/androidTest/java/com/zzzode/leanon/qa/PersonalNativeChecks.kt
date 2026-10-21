package com.zzzode.leanon.qa

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
import java.security.MessageDigest
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

/** Real Android Keystore/Bitmap/JCA checks, scoped to disposable cache and generated non-health pixels. */
internal class PersonalNativeChecks(private val instrumentation: Instrumentation) {
  fun run() {
    val base = instrumentation.targetContext; check(base.packageName == "com.zzzode.leanon.uiqa")
    val directory = File(base.cacheDir, "personal-native").apply { mkdirs() }
    val fixture = File(directory, "fixture-${UUID.randomUUID()}").apply { mkdirs() }
    val original = File(base.filesDir, "records.json")
    fun hash(file: File): String? = if (!file.exists()) null else MessageDigest.getInstance("SHA-256").digest(file.readBytes()).joinToString("") { "%02x".format(it) }
    val before = hash(original); val checks = JSONArray(); var success = false
    val context = object : ContextWrapper(base) {
      override fun getFilesDir() = fixture
      override fun getCacheDir() = File(fixture, "cache").apply { mkdirs() }
      override fun getApplicationContext(): Context = this
      override fun getPackageName() = base.packageName + ".fixture-" + fixture.name
    }
    val journalKeys = PersonalKeyStore(context, File(fixture, "journal"), "transaction")
    try {
      val now = Clock.fixed(Instant.parse("2026-10-07T12:00:00Z"), ZoneOffset.UTC)
      val records = RecordsRepository(context) { now }; val personal = PersonalRepository(context)
      val journal = PrivateTransactionJournal(File(fixture, "journal"), journalKeys::key, { it.canonicalPath.startsWith(fixture.canonicalPath + File.separator) })
      val backup = BackupCoordinator({ records }, { personal }, journal)
      backup.recover(); records.availabilityCheck = backup::requireAvailable; personal.availabilityCheck = backup::requireAvailable
      fun pass(id: String) { checks.put(JSONObject().put("id", id).put("passed", true)) }
      check(records.currentSnapshot().getJSONArray("weights").length() == 0 && personal.snapshot().getInt("revision") == 0)
      check(!records.storageFile.exists() && !personal.storageFile.exists()); pass("fresh-read-no-records-or-personal-write")
      records.mutate("water", 0, JSONObject().put("type", "set-water").put("date", "2026-10-07").put("amountMl", 500))
      val ledgerFile = File(fixture, "health-connect-export-versions.json")
      com.zzzode.leanon.healthconnect.HealthConnectExportLedger(ledgerFile).reserve(listOf(com.zzzode.leanon.healthconnect.ExportVersionRequest("synthetic-weight", "legacy-public-fingerprint")))
      val legacyLedgerBytes = ledgerFile.readBytes()
      val exportLedger = com.zzzode.leanon.healthconnect.HealthConnectExportLedger(context)
      exportLedger.reserve(listOf(com.zzzode.leanon.healthconnect.ExportVersionRequest("synthetic-weight", "legacy-public-fingerprint")))
      check(ledgerFile.readBytes().contentEquals(legacyLedgerBytes)); pass("legacy-health-ledger-compatible-read-retry-does-not-migrate")
      exportLedger.reserve(listOf(com.zzzode.leanon.healthconnect.ExportVersionRequest("synthetic-weight", "public-fingerprint")))
      check(!ledgerFile.readText().contains("public-fingerprint"))
      check(com.zzzode.leanon.healthconnect.HealthConnectExportLedger(context).reserve(listOf(com.zzzode.leanon.healthconnect.ExportVersionRequest("synthetic-weight", "public-fingerprint")))["synthetic-weight"] == 3L)
      pass("actual-keystore-derived-health-export-ledger-encryption-reopen")
      check(!records.storageFile.readText().contains("amountMl"))
      check(RecordsRepository(context) { now }.loadHostData().getJSONArray("water").getJSONObject(0).getInt("amountMl") == 500); pass("actual-keystore-record-encryption-reopen")
      val bitmap = Bitmap.createBitmap(16, 12, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.rgb(125, 130, 135)) }
      val originalImage = ByteArrayOutputStream().apply { bitmap.compress(Bitmap.CompressFormat.PNG, 100, this) }.toByteArray(); bitmap.recycle()
      val image = try { PersonalImageProcessor.sanitize(originalImage) } finally { originalImage.fill(0) }
      try {
        validateDecodedSanitizedJpeg(image.bytes, 16, 12)
        val decodeFile = File(fixture, "PUBLIC-decode.jpg").apply { writeBytes(image.bytes) }
        val encoded = com.facebook.imagepipeline.image.EncodedImage(com.facebook.common.internal.Supplier { java.io.FileInputStream(decodeFile) })
        val decoded = BoundedPhotoDecoder().decode(encoded, image.bytes.size, com.facebook.imagepipeline.image.ImmutableQualityInfo.FULL_QUALITY, com.facebook.imagepipeline.common.ImageDecodeOptions.defaults())
        try { check(decoded.width == 16 && decoded.height == 12) } finally { decoded.close(); encoded.close(); decodeFile.delete() }
        val previews = PersonalPreviews(context)
        val firstUri = previews.make("own", "generated-1", image.bytes); val secondUri = previews.make("own", "generated-2", image.bytes)
        check(previews.allows(firstUri) && !previews.allows("https://example.com/photo.jpg") && !previews.allows("content://photos/1"))
        check(!previews.allows(android.net.Uri.fromFile(records.storageFile).toString()))
        var pending: com.lynx.tasm.image.model.ImageLoadListener? = null
        var delegated = 0; var failures = 0; var delivered = 0
        val fake = java.lang.reflect.Proxy.newProxyInstance(javaClass.classLoader, arrayOf(com.lynx.tasm.service.ILynxImageService::class.java)) { _, method, args ->
          if (method.name == "decodeImage") { delegated++; pending = args[1] as com.lynx.tasm.image.model.ImageLoadListener }
          if (method.returnType == Boolean::class.javaPrimitiveType) false else null
        } as com.lynx.tasm.service.ILynxImageService
        val service = ApprovedPhotoImageService(previews::allows, previews::deliverApproved, fake)
        val listener = object : com.lynx.tasm.image.model.ImageLoadListener {
          override fun onRequestSubmit(info: com.lynx.tasm.image.model.ImageRequestInfo) {}
          override fun onSuccess(content: com.lynx.tasm.image.ImageContent?, info: com.lynx.tasm.image.model.ImageRequestInfo, imageInfo: com.lynx.tasm.image.model.ImageInfo) { delivered++ }
          override fun onFailure(code: Int, error: Throwable?) { failures++ }
          override fun onImageMonitorInfo(value: JSONObject) {}
        }
        val request = com.lynx.tasm.image.model.ImageRequestInfoBuilder.newBuilderWithSource(firstUri).build()
        service.decodeImage(request, listener); check(delegated == 1)
        previews.clear("own")
        pending!!.onSuccess(null, request, com.lynx.tasm.image.model.ImageInfo(16, 12, false))
        check(delivered == 0 && failures == 1 && !previews.allows(firstUri))
        service.decodeImage(request, listener); check(delegated == 1 && failures == 2)
        val tamperUri = previews.make("own", "tamper-photo", image.bytes)
        File(android.net.Uri.parse(tamperUri).path!!).appendBytes(byteArrayOf(1)); check(!previews.allows(tamperUri))
        val blockedUri = previews.make("own", "cleanup-failure", image.bytes)
        val obstruction = File(File(android.net.Uri.parse(blockedUri).path!!).parentFile, "own-cleanup-obstruction").apply { mkdirs() }
        val child = File(obstruction, "fixture").apply { writeText("PUBLIC") }
        check(runCatching { previews.clear("own") }.isFailure && !previews.allows(blockedUri))
        check(runCatching { previews.requestGeneration("own") }.isFailure)
        check(runCatching { previews.make("own", "blocked-new", image.bytes) }.isFailure)
        child.delete(); obstruction.delete(); previews.clear(); previews.setForeground(true)
        pass("issued-image-service-denies-arbitrary-uris-tamper-and-revoked-inflight-delivery")
        val stableUri = previews.make("own", "generated-1", image.bytes)
        val otherUri = previews.make("own", "generated-2", image.bytes)
        check(stableUri != otherUri && File(android.net.Uri.parse(stableUri).path!!).exists() && File(android.net.Uri.parse(otherUri).path!!).exists())
        check(previews.make("own", "generated-1", image.bytes) == stableUri)
        previews.make("partner", "generated-3", image.bytes); previews.clear("partner")
        check(File(android.net.Uri.parse(stableUri).path!!).exists()); previews.clear()
        check(previews.make("own", "generated-1", image.bytes) != firstUri); previews.clear()
        pass("simultaneous-preview-stability-dedup-peer-revocation-and-close-cleanup")
        val meta = JSONObject().put("id", "generated-photo").put("date", "2026-10-07").put("view", "other").put("createdAt", "2026-10-07T12:00:00Z").put("mime", "image/jpeg").put("width", 16).put("height", 12)
        personal.mutate("add-photo", 0, JSONObject().put("type", "add-photo").put("photo", meta), image.bytes)
        check(!personal.storageFile.readText().contains("generated-photo"))
        check(PersonalRepository(context).photo("generated-photo").second.contentEquals(image.bytes)); pass("generated-pixels-sanitize-encrypted-photo-reopen-exact-bytes")
        // Insert APP1 after the encoded scan: a header-only parser would miss this metadata.
        val metadata = byteArrayOf(-1, -31, 0, 8, 69, 120, 105, 102, 0, 0)
        val foreign = image.bytes.copyOfRange(0, image.bytes.size - 2) + metadata + byteArrayOf(-1, -39)
        check(runCatching { validateDecodedSanitizedJpeg(foreign, 16, 12) }.isFailure); pass("post-scan-exif-metadata-rejected")
        val beforeR = records.storageFile.readBytes(); val beforeP = personal.storageFile.readBytes()
        val payload = backup.exportPayload(); val file = BackupCodec.seal(payload, "PUBLIC synthetic native password")
        check(!String(file).contains("amountMl") && !String(file).contains("generated-photo"))
        check(runCatching { backup.inspect(file, "wrong synthetic native password") }.isFailure)
        check(records.storageFile.readBytes().contentEquals(beforeR) && personal.storageFile.readBytes().contentEquals(beforeP)); pass("wrong-password-does-not-write-any-store")
        val plan = backup.inspect(file, "PUBLIC synthetic native password")
        check(records.storageFile.readBytes().contentEquals(beforeR) && personal.storageFile.readBytes().contentEquals(beforeP)); pass("backup-preview-readonly")
        val restored = backup.restore(plan.getString("token"), 1, 1)
        check(restored.getJSONObject("hostData").getInt("revision") == 2 && restored.getJSONObject("personal").getInt("revision") == 2)
        check(personal.photo("generated-photo").second.contentEquals(image.bytes)); pass("backup-confirm-atomic-exact-photo-bytes-revisions-reopen")
        personal.mutate("delete-photo", 2, JSONObject().put("type", "delete-photo").put("id", "generated-photo"))
        check(PersonalRepository(context).snapshot().getJSONArray("photos").length() == 0); pass("photo-delete-metadata-and-bytes-reopen")
        val settingsFile = File(fixture, "settings.json")
        val settings = com.zzzode.leanon.data.SettingsRepository(settingsFile)
        settings.setHealthConnectEnabled(true); settings.setLastSyncEpochMs(123)
        val gate = com.zzzode.leanon.healthconnect.HealthSyncCommitGate(); val pendingGeneration = gate.current()
        com.zzzode.leanon.healthconnect.performLocalHealthDataDeletion(settings, gate, {}, backup::deleteLocalData)
        check(!records.storageFile.exists() && !personal.storageFile.exists() && !ledgerFile.exists())
        check(!com.zzzode.leanon.data.SettingsRepository(settingsFile).getHealthConnectEnabled() && settings.getLastSyncEpochMs() == 0L)
        check(runCatching { gate.commit(pendingGeneration) { records.upsertWater("2026-10-07", 100.0) } }.isFailure)
        check(!records.storageFile.exists()); pass("explicit-local-delete-stores-ledger-keys-disabled-autoimport-and-stale-result-blocked")
      } finally { image.bytes.fill(0) }
      val publicFixture = JSONObject(instrumentation.context.assets.open("public-backup-v1.json").bufferedReader().use { it.readText() })
      val publicEnvelope = instrumentation.context.assets.open("public-backup-v1.envelope.json").use { it.readBytes() }
      val interoperable = BackupCodec.open(publicEnvelope, publicFixture.getString("password"))
      val foreignImage = PersonalCrypto.decode(interoperable.getJSONArray("photos").getJSONObject(0).getString("bytesBase64"))
      try { validateDecodedSanitizedJpeg(foreignImage, 4, 4) } finally { foreignImage.fill(0) }
      val publicPlan = backup.inspect(publicEnvelope, publicFixture.getString("password"))
      val imported = backup.restore(publicPlan.getString("token"), 0, 0)
      check(imported.getJSONObject("personal").getJSONArray("photos").length() == 1)
      val expectedImage = PersonalCrypto.decode(interoperable.getJSONArray("photos").getJSONObject(0).getString("bytesBase64"))
      val storedImage = personal.photo("public-photo-1").second
      try { check(expectedImage.contentEquals(storedImage)) } finally { expectedImage.fill(0); storedImage.fill(0) }
      pass("actual-jca-public-node-unicode-backup-decode-restore-photo-exact-bytes")
      backup.deleteLocalData()
      check(before == hash(original)); success = true
    } catch (error: Throwable) {
      File(directory, "failure.log").writeText(error.javaClass.name + ": " + (error.message ?: "Native fixture failure") + "\n" + error.stackTrace.joinToString("\n"))
    } finally {
      runCatching { journalKeys.delete() }
      fixture.deleteRecursively()
      File(directory, "report.json").writeText(JSONObject().put("passed", success).put("checks", checks).put("capturedUtc", Instant.now().toString()).put("beforeRecordsSha256", before).put("afterRecordsSha256", hash(original)).put("scope", "Real Android Keystore, JPEG pixels and JCA; cache-only fictional records; no actual document picker/camera/permissions or UI-save acceptance").toString(2))
      instrumentation.finish(if (success) Activity.RESULT_OK else Activity.RESULT_CANCELED, Bundle().apply { putString("report", "cache/personal-native/report.json") })
    }
  }
}
