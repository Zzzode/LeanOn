package com.zzzode.leanon.qa

import android.app.Activity
import android.app.Instrumentation
import android.content.Context
import android.content.ContextWrapper
import android.os.Bundle
import com.zzzode.leanon.data.RecordsRepository
import com.zzzode.leanon.personal.*
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.time.Instant

/** Direct peer-native cryptography on an explicitly PUBLIC synthetic payload only. */
internal class PublicBackupInteropChecks(private val instrumentation: Instrumentation) {
  fun run() {
    val base = instrumentation.targetContext
    check(base.packageName == "com.zzzode.leanon.uiqa")
    val directory = File(base.cacheDir, "native-backup-interop").apply { mkdirs() }
    val fixture = File(directory, "fixture").apply { mkdirs() }
    val context = object : ContextWrapper(base) {
      override fun getApplicationContext(): Context = this
      override fun getFilesDir(): File = fixture
      override fun getPackageName() = "com.zzzode.leanon.uiqa.public-backup-interop"
    }
    val original = File(base.filesDir, "records.json")
    fun sha(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    fun originalHash() = if (original.exists()) sha(original.readBytes()) else "missing"
    val before = originalHash()
    val keys = PersonalKeyStore(context, File(fixture, "journal-key"), "public-backup-interop")
    val records = RecordsRepository(context)
    val personal = PersonalRepository(context)
    val journal = PrivateTransactionJournal(File(fixture, "journal"), keys::key, { it.canonicalPath.startsWith(fixture.canonicalPath + File.separator) })
    val backup = BackupCoordinator({ records }, { personal }, journal)
    val report = JSONObject().put("classification", "PUBLIC synthetic Swift-Kotlin direct backup interchange; no accounts, sessions, credentials, real health data or OS picker")
    var success = false
    try {
      val publicFixture = JSONObject(instrumentation.context.assets.open("public-backup-v1.json").bufferedReader().use { it.readText() })
      val source = File(directory, "swift-export.envelope.json").readBytes()
      val payload = BackupCodec.open(source, publicFixture.getString("password"))
      check(personalCanonical(payload) == personalCanonical(publicFixture.getJSONObject("payload")))
      val photo = PersonalCrypto.decode(payload.getJSONArray("photos").getJSONObject(0).getString("bytesBase64"))
      try { validateDecodedSanitizedJpeg(photo, 4, 4) } finally { photo.fill(0) }
      val plan = backup.inspect(source, publicFixture.getString("password"))
      val result = backup.restore(plan.getString("token"), 0, 0)
      check(result.getJSONObject("personal").getJSONArray("photos").length() == 1)
      val expected = instrumentation.context.assets.open("public-backup-v1.jpeg").use { it.readBytes() }
      val actual = personal.photo("public-photo-1").second
      try { check(expected.contentEquals(actual)); report.put("exactJpegSha256", sha(actual)) }
      finally { expected.fill(0); actual.fill(0) }
      val exported = BackupCodec.seal(payload, publicFixture.getString("password"))
      File(directory, "kotlin-export.envelope.json").writeBytes(exported)
      report.put("swiftEnvelopeSha256", sha(source)).put("kotlinEnvelopeSha256", sha(exported))
        .put("swiftDecryptValidateInspectAtomicRestore", true).put("kotlinActualJcaExport", true)
      backup.deleteLocalData()
      check(before == originalHash())
      success = true
    } catch (error: Throwable) {
      report.put("failureType", error.javaClass.name)
    } finally {
      runCatching { keys.delete() }; fixture.deleteRecursively()
      report.put("passed", success).put("capturedUtc", Instant.now().toString()).put("originalQaRecordsBefore", before).put("originalQaRecordsAfter", originalHash())
      File(directory, "report.json").writeText(report.toString(2))
      instrumentation.finish(if (success) Activity.RESULT_OK else Activity.RESULT_CANCELED, Bundle().apply { putString("report", "cache/native-backup-interop/report.json") })
    }
  }
}
