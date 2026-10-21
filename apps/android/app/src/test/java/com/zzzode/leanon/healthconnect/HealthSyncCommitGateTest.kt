package com.zzzode.leanon.healthconnect

import org.junit.Assert.*
import org.junit.Test
import org.junit.Rule
import org.junit.rules.TemporaryFolder
import java.io.IOException

class HealthSyncCommitGateTest {
  @get:Rule val temporary = TemporaryFolder()
  @Test fun oldProviderResultCannotRecreateRecordsLedgerOrTimestampAfterDelete() {
    val gate = HealthSyncCommitGate(); val old = gate.current(); var writes = 0
    gate.commit(old) { writes++ }
    gate.invalidate { writes = 0 }
    for (kind in listOf("mirror", "ledger", "sync-time")) {
      assertThrows(IOException::class.java) { gate.commit(old) { writes++; kind } }
    }
    assertEquals(0, writes)
    gate.commit(gate.current()) { writes++ }; assertEquals(1, writes)
  }
  @Test fun failedDeletionStillInvalidatesPreviouslyQueuedProviderWork() {
    val gate = HealthSyncCommitGate(); val old = gate.current()
    assertThrows(IOException::class.java) { gate.invalidate { throw IOException("fixture write failure") } }
    assertThrows(IOException::class.java) { gate.commit(old) { fail("Late result must not commit") } }
  }
  @Test fun localCleanupDisablesAutoImportAndClearsLastSyncDurablyBeforeDeleting() {
    val file = temporary.root.resolve("settings.json")
    val settings = com.zzzode.leanon.data.SettingsRepository(file)
    settings.setHealthConnectEnabled(true); settings.setLastSyncEpochMs(123)
    var deleted = false; var cancelled = false
    performLocalHealthDataDeletion(settings, HealthSyncCommitGate(), { cancelled = true }) {
      val reopened = com.zzzode.leanon.data.SettingsRepository(file)
      assertFalse(reopened.getHealthConnectEnabled()); assertEquals(0L, reopened.getLastSyncEpochMs()); deleted = true
    }
    assertTrue(cancelled); assertTrue(deleted)
  }
  @Test fun corruptSettingsPreserveDataAndInvalidateOldSyncUntilDeletionCanRetry() {
    val file = temporary.root.resolve("settings.json").apply { writeText("{broken") }
    val gate = HealthSyncCommitGate(); val old = gate.current(); var deleted = false
    assertThrows(IOException::class.java) { performLocalHealthDataDeletion(com.zzzode.leanon.data.SettingsRepository(file), gate, {}) { deleted = true } }
    assertFalse(deleted); assertEquals("{broken", file.readText())
    assertThrows(IOException::class.java) { gate.commit(old) { fail("Old import cannot commit") } }
  }
}
