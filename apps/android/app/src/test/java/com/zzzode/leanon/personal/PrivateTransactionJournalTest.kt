package com.zzzode.leanon.personal

import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.IOException
import javax.crypto.spec.SecretKeySpec

class PrivateTransactionJournalTest {
  @get:Rule val temporary = TemporaryFolder()
  private val key = SecretKeySpec(ByteArray(32) { it.toByte() }, "AES")
  private fun journal(fault: (String) -> Unit = {}) = PrivateTransactionJournal(File(temporary.root, "journal"), { key }, { it.canonicalPath.startsWith(temporary.root.canonicalPath + File.separator) }, fault)
  private fun target(name: String, value: String) = File(temporary.root, name).apply { writeText(value) }
  @Test fun commitThreeTargetsAndPublishOnlyAfterDurability() {
    val records = target("records", "before records"); val personal = target("personal", "before photos"); val metadata = target("metadata", "before cursor")
    var published = false
    journal().commit(listOf(AtomicPrivateWrite(records, "after records".toByteArray()), AtomicPrivateWrite(personal, "after photos".toByteArray()), AtomicPrivateWrite(metadata, "after cursor".toByteArray()) { published = true }))
    assertTrue(published); assertEquals("after records", records.readText()); assertEquals("after photos", personal.readText()); assertEquals("after cursor", metadata.readText())
    assertFalse(File(temporary.root, "journal/transaction.enc").exists())
  }
  @Test fun ordinaryFailureRollsBackAllBytesAndDoesNotPublish() {
    val records = target("records", "before records"); val personal = target("personal", "before photos"); var published = false
    assertThrows(IOException::class.java) { journal { if (it == "replaced") throw IOException("Synthetic failed replacement") }.commit(listOf(AtomicPrivateWrite(records, "after".toByteArray()), AtomicPrivateWrite(personal, "after".toByteArray()) { published = true })) }
    assertFalse(published); assertEquals("before records", records.readText()); assertEquals("before photos", personal.readText())
  }
  @Test fun processDeathBeforeCommitMarkerRecoversBeforeState() {
    val records = target("records", "before records"); val personal = target("personal", "before photos")
    assertThrows(AssertionError::class.java) { journal { if (it == "replaced") throw AssertionError("Simulated process termination") }.commit(listOf(AtomicPrivateWrite(records, "after records".toByteArray()), AtomicPrivateWrite(personal, "after photos".toByteArray()))) }
    assertEquals("after records", records.readText())
    val files = File(temporary.root, "journal").listFiles()!!
    assertTrue(files.none { it.readBytes().toString(Charsets.ISO_8859_1).contains("before records") })
    journal().recover(); assertEquals("before records", records.readText()); assertEquals("before photos", personal.readText())
  }
  @Test fun processDeathAfterCommitMarkerRecoversCommittedDeletionAndNewFile() {
    val deleted = target("deleted", "before"); val created = File(temporary.root, "created")
    assertThrows(AssertionError::class.java) { journal { if (it == "committed") throw AssertionError("Simulated process termination") }.commit(listOf(AtomicPrivateWrite(deleted, null), AtomicPrivateWrite(created, "new".toByteArray()))) }
    deleted.writeText("stale"); created.delete()
    journal().recover(); assertFalse(deleted.exists()); assertEquals("new", created.readText())
  }
  @Test fun uncertainCommitMarkerRetainsPiecesAndBlocksUntilRecovery() {
    val record = target("record", "before"); var markers = 0
    val directory = File(temporary.root, "journal")
    val transaction = PrivateTransactionJournal(directory, { key }, { it.canonicalPath.startsWith(temporary.root.canonicalPath + File.separator) }, persist = { file, bytes ->
      com.zzzode.leanon.data.writeBytesAtomically(file, bytes)
      if (file.name == "transaction.enc" && ++markers == 2) throw com.zzzode.leanon.data.AtomicDurabilityUncertain("Synthetic post-rename barrier failure", IOException("synthetic"))
    })
    assertThrows(IOException::class.java) { transaction.commit(listOf(AtomicPrivateWrite(record, "after".toByteArray()))) }
    assertFalse(transaction.available); assertEquals("after", record.readText())
    assertTrue(directory.listFiles()!!.any { it.name.endsWith(".piece") })
    journal().recover(); assertEquals("after", record.readText())
  }
  @Test fun corruptRecoveryBlocksReadsAndPreservesTargets() {
    val record = target("record", "before")
    assertThrows(AssertionError::class.java) { journal { if (it == "prepared") throw AssertionError("Simulated process termination") }.commit(listOf(AtomicPrivateWrite(record, "after".toByteArray()))) }
    File(temporary.root, "journal/transaction.enc").appendText("broken")
    val reopened = journal(); assertThrows(IOException::class.java) { reopened.recover() }; assertThrows(IOException::class.java) { reopened.requireAvailable() }
    assertEquals("before", record.readText())
  }
}
