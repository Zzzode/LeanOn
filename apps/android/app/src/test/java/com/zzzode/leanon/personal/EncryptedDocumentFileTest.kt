package com.zzzode.leanon.personal

import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.IOException
import javax.crypto.spec.SecretKeySpec

class EncryptedDocumentFileTest {
  @get:Rule val temporary = TemporaryFolder()
  private val key = SecretKeySpec(ByteArray(32) { (it + 3).toByte() }, "AES")
  @Test fun firstReadDoesNotCreateKeysOrFiles() {
    val file = temporary.root.resolve("private.json")
    val store = EncryptedDocumentFile(file, "personal", { error("Fresh reads must not create keys") })
    assertNull(store.readOrNull()); assertFalse(file.exists())
  }
  @Test fun durableEncryptedRoundtripAndReopen() {
    val file = temporary.root.resolve("private.json")
    EncryptedDocumentFile(file, "personal", { key }).write("health-free test note".toByteArray())
    assertFalse(file.readText().contains("test note"))
    assertArrayEquals("health-free test note".toByteArray(), EncryptedDocumentFile(file, "personal", { key }).readOrNull())
  }
  @Test fun failingWriteLeavesLastEncryptedBytesAndReopensOldValue() {
    val file = temporary.root.resolve("private.json")
    val store = EncryptedDocumentFile(file, "personal", { key }); store.write("first".toByteArray())
    val before = file.readBytes()
    val failing = EncryptedDocumentFile(file, "personal", { key }, persist = { _, _ -> throw IOException("Synthetic disk failure") })
    assertThrows(IOException::class.java) { failing.write("second".toByteArray()) }
    assertArrayEquals(before, file.readBytes()); assertArrayEquals("first".toByteArray(), store.readOrNull())
  }
  @Test fun corruptAndWrongKeyReadsDoNotReplaceFile() {
    val file = temporary.root.resolve("private.json"); file.writeText("{bad")
    assertThrows(IOException::class.java) { EncryptedDocumentFile(file, "personal", { key }).readOrNull() }
    assertEquals("{bad", file.readText())
    EncryptedDocumentFile(file, "personal", { key }).write("first".toByteArray()); val bytes = file.readBytes()
    assertThrows(IOException::class.java) { EncryptedDocumentFile(file, "personal", { SecretKeySpec(ByteArray(32), "AES") }).readOrNull() }
    assertArrayEquals(bytes, file.readBytes())
  }
}
