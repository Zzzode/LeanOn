package com.zzzode.leanon.modules

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class HealthConnectEnableTest {
  @Test fun deniedPermissionNeverPersistsOrSyncs() = runBlocking {
    var writes = 0; var syncs = 0
    try {
      enableHealthConnectDurably(true, { true }, { false }, { false }, { writes++ }, { syncs++; true })
      fail("Expected denial")
    } catch (failure: HealthConnectOperationFailure) { assertEquals("not-authorized", failure.code) }
    assertEquals(0, writes); assertEquals(0, syncs)
  }

  @Test fun persistenceFailureNeverStartsSync() = runBlocking {
    var syncs = 0
    try {
      enableHealthConnectDurably(true, { true }, { true }, { false }, { throw IOException("Disk full") }, { syncs++; true })
      fail("Expected storage failure")
    } catch (_: IOException) { assertEquals(0, syncs) }
  }

  @Test fun initialSyncFailureRestoresPreviousPreference() = runBlocking {
    var enabled = false
    try {
      enableHealthConnectDurably(true, { true }, { true }, { enabled }, { enabled = it }, { false })
      fail("Expected sync failure")
    } catch (failure: HealthConnectOperationFailure) { assertEquals("unavailable", failure.code) }
    assertFalse(enabled)
  }

  @Test fun rollbackFailureStillReportsOriginalFailure() = runBlocking {
    var writes = 0
    try {
      enableHealthConnectDurably(true, { true }, { true }, { false }, { if (++writes == 2) throw IOException("Rollback failed") }, { false })
      fail("Expected sync failure")
    } catch (failure: HealthConnectOperationFailure) { assertEquals(1, failure.suppressed.size) }
  }

  @Test fun disableDoesNotRequireProviderOrPermission() = runBlocking {
    var enabled = true
    enableHealthConnectDurably(false, { error("Must not query provider") }, { error("Must not query permissions") }, { enabled }, { enabled = it }, { error("Must not sync") })
    assertFalse(enabled)
  }

  @Test fun successfulEnableWaitsForSync() = runBlocking {
    val order = mutableListOf<String>()
    enableHealthConnectDurably(true, { true }, { true }, { false }, { order += "persist-$it" }, { order += "sync"; true })
    assertEquals(listOf("persist-true", "sync"), order)
  }
}
