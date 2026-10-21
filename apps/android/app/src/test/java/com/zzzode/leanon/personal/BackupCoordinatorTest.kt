package com.zzzode.leanon.personal

import com.zzzode.leanon.data.RecordsRepository
import com.zzzode.leanon.data.emptyDailyRecords
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import javax.crypto.spec.SecretKeySpec

class BackupCoordinatorTest {
  @get:Rule val temporary = TemporaryFolder()
  private val key = SecretKeySpec(ByteArray(32) { it.toByte() }, "AES")
  private var elapsed = 0L
  private fun stores(): Pair<RecordsRepository, PersonalRepository> = RecordsRepository(File(temporary.root, "records.json"), { emptyDailyRecords().toString() }) to PersonalRepository(EncryptedDocumentFile(File(temporary.root, "personal.enc"), "personal", { key }))
  private fun coordinator(r: RecordsRepository, p: PersonalRepository) = BackupCoordinator({ r }, { p }, PrivateTransactionJournal(File(temporary.root, "journal"), { key }, { it.canonicalPath.startsWith(temporary.root.canonicalPath + File.separator) }), now = { 1791374400000L }, elapsedNanos = { elapsed }, validateImage = ::validateSanitizedJpeg)
  private fun water(value: Int) = JSONObject().put("type", "set-water").put("date", "2026-10-06").put("amountMl", value)
  @Test fun inspectIsReadOnlyRestoreRevisionsAdvanceAndTokenConsumed() {
    val (r, p) = stores(); val c = coordinator(r, p); val payload = c.exportPayload(); val sealed = BackupCodec.seal(payload, "public fixture password")
    r.mutate("water-1", 0, water(500)); p.mutate("measure-1", 0, JSONObject("{\"type\":\"save-measurement\",\"measurement\":{\"id\":\"m1\",\"date\":\"2026-10-06\",\"waistCm\":82}}"))
    val beforeR = r.storageFile.readBytes(); val beforeP = p.storageFile.readBytes()
    val plan = c.inspect(sealed, "public fixture password")
    assertArrayEquals(beforeR, r.storageFile.readBytes()); assertArrayEquals(beforeP, p.storageFile.readBytes())
    val result = c.restore(plan.getString("token"), 1, 1)
    assertEquals(2, result.getJSONObject("hostData").getInt("revision")); assertEquals(0, result.getJSONObject("hostData").getJSONArray("water").length())
    assertEquals(2, result.getJSONObject("personal").getInt("revision")); assertEquals(0, result.getJSONObject("personal").getJSONArray("measurements").length())
    assertThrows(PersonalFailure::class.java) { c.restore(plan.getString("token"), 2, 2) }
    assertEquals(2, stores().second.snapshot().getInt("revision"))
  }
  @Test fun staleExpiredAndRestartedPlanCannotChangeBytes() {
    val (r, p) = stores(); val c = coordinator(r, p); val bytes = BackupCodec.seal(c.exportPayload(), "public fixture password")
    val plan = c.inspect(bytes, "public fixture password"); r.mutate("water", 0, water(250)); val before = r.storageFile.readBytes()
    assertEquals("conflict", assertThrows(PersonalFailure::class.java) { c.restore(plan.getString("token"), 0, 0) }.code)
    assertArrayEquals(before, r.storageFile.readBytes())
    elapsed = 300000000001L
    assertEquals("not-found", assertThrows(PersonalFailure::class.java) { c.restore(plan.getString("token"), 1, 0) }.code)
    assertEquals("not-found", assertThrows(PersonalFailure::class.java) { coordinator(r, p).restore(plan.getString("token"), 1, 0) }.code)
  }
  @Test fun syncCasRejectsConcurrentLocalWriteAndDoesNotPublishMetadata() {
    val (r, p) = stores(); val c = coordinator(r, p); val old = c.exportPayload(); r.mutate("water", 0, water(250))
    val before = r.storageFile.readBytes(); val metadata = File(temporary.root, "companion.enc").apply { writeText("old cursor") }; var published = false
    assertEquals("conflict", assertThrows(PersonalFailure::class.java) { c.mergeVaultPayload(old, AtomicPrivateWrite(metadata, "new cursor".toByteArray()) { published = true }, 0, 0) }.code)
    assertFalse(published); assertEquals("old cursor", metadata.readText()); assertArrayEquals(before, r.storageFile.readBytes())
  }
  @Test fun mergedRevisionsAdvanceExactlyOnceWithMetadataInSameCommit() {
    val (r, p) = stores(); val c = coordinator(r, p); val merged = c.exportPayload()
    merged.getJSONObject("records").put("revision", 1).getJSONArray("water").put(JSONObject("{\"id\":\"water-1\",\"date\":\"2026-10-06\",\"amountMl\":250}"))
    merged.getJSONObject("personal").put("revision", 1)
    val metadata = File(temporary.root, "companion.enc"); var published = false
    c.mergeVaultPayload(merged, AtomicPrivateWrite(metadata, "new cursor".toByteArray()) { published = true }, 0, 0)
    assertTrue(published); assertEquals(1, r.loadHostData().getInt("revision")); assertEquals(1, p.snapshot().getInt("revision")); assertEquals("new cursor", metadata.readText())
  }
  @Test fun attachChecksBothRevisionsAndDeleteIsDurable() {
    val (r, p) = stores(); val c = coordinator(r, p); r.mutate("water", 0, water(250)); var attached = false
    val ledger = File(r.storageFile.parentFile, "health-connect-export-versions.json").apply { writeText("synthetic derived metadata") }
    val unrelated = File(temporary.root, "unrelated-ledger").apply { writeText("leave unchanged") }
    assertThrows(PersonalFailure::class.java) { c.attach(0, 0) { attached = true } }; assertFalse(attached)
    c.attach(1, 0) { attached = true }; assertTrue(attached)
    c.deleteLocalData(); assertFalse(r.storageFile.exists()); assertFalse(p.storageFile.exists()); assertEquals(0, r.loadHostData().getInt("revision")); assertEquals(0, p.snapshot().getInt("revision"))
    assertFalse(ledger.exists()); assertEquals("leave unchanged", unrelated.readText())
  }
  @Test fun accountDeletionCasDoesNotClearNewerDataOrPublishMetadata() {
    val (r, p) = stores(); val c = coordinator(r, p); r.mutate("water-cas", 0, water(300))
    val original = r.storageFile.readBytes(); val metadata = File(temporary.root, "account.enc").apply { writeText("pending") }; var published = false
    assertEquals("conflict", assertThrows(PersonalFailure::class.java) {
      c.deleteAccountLocalData(0, 0, AtomicPrivateWrite(metadata, "cleared".toByteArray()) { published = true })
    }.code)
    assertArrayEquals(original, r.storageFile.readBytes()); assertEquals("pending", metadata.readText()); assertFalse(published)
  }
  @Test fun accountDeletionMarkerCommitsBeforeFallibleKeyCleanupAndRetryDoesNotRewipe() {
    val (r, originalPersonal) = stores(); var failKeyCleanup = true
    val p = PersonalRepository(EncryptedDocumentFile(originalPersonal.storageFile, "personal", { key }, eraseKey = {
      if (failKeyCleanup) throw java.io.IOException("PUBLIC injected key cleanup failure")
    }))
    val c = coordinator(r, p); r.mutate("water-delete", 0, water(300))
    val metadata = File(temporary.root, "account.enc"); var published = false; var erasures = 0
    r.eraseStorageKeys = { erasures++; assertEquals("cleared", metadata.readText()); assertTrue(published) }
    assertThrows(java.io.IOException::class.java) {
      c.deleteAccountLocalData(1, 0, AtomicPrivateWrite(metadata, "cleared".toByteArray()) { published = true })
    }
    assertTrue(published); assertEquals("cleared", metadata.readText()); assertFalse(r.storageFile.exists()); assertFalse(p.storageFile.exists())
    failKeyCleanup = false; c.finishDeletionKeyCleanup(); assertEquals(2, erasures); assertFalse(r.storageFile.exists())
  }
  @Test fun accountDeletionKeyRetryPreservesRecreatedRecordsAndTheirKeys() {
    val (r, p) = stores(); val c = coordinator(r, p); val metadata = File(temporary.root, "account.enc"); var erasures = 0
    r.eraseStorageKeys = { erasures++ }
    c.deleteAccountLocalData(0, 0, AtomicPrivateWrite(metadata, "cleared".toByteArray()))
    r.mutate("new-water-after-clear", 0, water(450)); val bytes = r.storageFile.readBytes()
    assertEquals("conflict", assertThrows(PersonalFailure::class.java) { c.finishDeletionKeyCleanup() }.code)
    assertArrayEquals(bytes, r.storageFile.readBytes()); assertEquals(1, erasures); assertEquals("cleared", metadata.readText())
  }

}
