package com.zzzode.leanon.healthconnect

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class HealthConnectSyncResultTest {
  @Test fun exportFailureDoesNotClaimCompleteSyncOrChangeItsTimestamp() = runBlocking {
    var timestamp = 100L
    var imported = false
    val success = completeHealthConnectSync({ imported = true }, { false }, { timestamp = 200L })
    assertTrue(imported)
    assertFalse(success)
    assertEquals(100L, timestamp)
  }

  @Test fun timestampIsWrittenOnlyAfterTheExportSucceeds() = runBlocking {
    val sequence = mutableListOf<String>()
    assertTrue(completeHealthConnectSync({ sequence.add("import") }, { sequence.add("export"); true }, { sequence.add("stamp") }))
    assertEquals(listOf("import", "export", "stamp"), sequence)
  }

  @Test fun thrownExportFailureLeavesThePreviousTimestampUntouched() = runBlocking {
    var timestamp = 100L
    try {
      completeHealthConnectSync({}, { throw IOException("Provider failed") }, { timestamp = 200L })
      fail("Expected provider failure")
    } catch (_: IOException) { assertEquals(100L, timestamp) }
  }

  @Test fun timestampPersistenceFailureDoesNotAcknowledgeSync() = runBlocking {
    var timestamp = 100L
    try {
      completeHealthConnectSync({}, { true }, { throw IOException("Disk full") })
      fail("Expected timestamp persistence failure")
    } catch (_: IOException) { assertEquals(100L, timestamp) }
  }
}
