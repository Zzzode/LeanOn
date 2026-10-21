package com.zzzode.leanon.healthconnect

import com.zzzode.leanon.personal.EncryptedLegacyJsonCodec
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class HealthConnectLedgerEncryptionTest {
  @get:Rule val temporary = TemporaryFolder()
  private val key = ByteArray(32) { it.toByte() }
  private fun codec(value: ByteArray = key) = EncryptedLegacyJsonCodec("health-connect-ledger", key = { javax.crypto.spec.SecretKeySpec(value, "AES") })
  @Test fun legacyReadAndUnchangedRetryPreserveBytesThenExplicitEditEncryptsAndReopens() {
    val file = temporary.newFile().apply { delete() }
    HealthConnectExportLedger(file).reserve(listOf(ExportVersionRequest("weight", "a")))
    val legacy = file.readBytes()
    assertEquals(2L, HealthConnectExportLedger(file, codec()).reserve(listOf(ExportVersionRequest("weight", "a")))["weight"])
    assertArrayEquals(legacy, file.readBytes())
    assertEquals(3L, HealthConnectExportLedger(file, codec()).reserve(listOf(ExportVersionRequest("weight", "b")))["weight"])
    assertFalse(file.readText().contains("fingerprint"))
    assertEquals(3L, HealthConnectExportLedger(file, codec()).reserve(listOf(ExportVersionRequest("weight", "b")))["weight"])
  }
  @Test fun wrongKeyAndCorruptEnvelopePreserveFile() {
    val file = temporary.newFile().apply { delete() }
    HealthConnectExportLedger(file, codec()).reserve(listOf(ExportVersionRequest("weight", "a")))
    val before = file.readBytes()
    assertTrue(runCatching { HealthConnectExportLedger(file, codec(ByteArray(32))).reserve(listOf(ExportVersionRequest("weight", "b"))) }.isFailure)
    assertArrayEquals(before, file.readBytes())
    file.writeText("{broken")
    assertTrue(runCatching { HealthConnectExportLedger(file, codec()).reserve(emptyList()) }.isFailure)
    assertEquals("{broken", file.readText())
  }
}
