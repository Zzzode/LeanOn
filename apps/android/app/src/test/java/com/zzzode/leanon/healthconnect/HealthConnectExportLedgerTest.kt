package com.zzzode.leanon.healthconnect

import com.zzzode.leanon.data.writeRecordsAtomically
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.IOException
import java.util.concurrent.Callable
import java.util.concurrent.Executors

class HealthConnectExportLedgerTest {
  @get:Rule val temporary = TemporaryFolder()
  private fun file() = temporary.root.resolve("export-ledger.json")
  private fun request(content: String, id: String = "leanon-weight-2026-10-06") = ExportVersionRequest(id, content)

  @Test fun migratesLegacyVersionOneAndUnchangedRetriesDoNotWriteAgain() {
    var writes = 0
    val ledger = HealthConnectExportLedger(file()) { file, content -> writes++; writeRecordsAtomically(file, content) }
    val requests = listOf(request("weight-80"), request("nutrition-1000", "leanon-nutrition-2026-10-06"))
    assertTrue(ledger.reserve(requests).values.all { it == 2L })
    val before = file().readText()
    assertTrue(HealthConnectExportLedger(file()).reserve(requests.reversed()).values.all { it == 2L })
    assertEquals(before, file().readText()); assertEquals(1, writes)
  }

  @Test fun editsAndRevertingContentMonotonicallyAdvanceAcrossRestarts() {
    val id = request("a").clientRecordId
    assertEquals(2L, HealthConnectExportLedger(file()).reserve(listOf(request("a")))[id])
    assertEquals(3L, HealthConnectExportLedger(file()).reserve(listOf(request("b")))[id])
    assertEquals(4L, HealthConnectExportLedger(file()).reserve(listOf(request("a")))[id])
    assertEquals(4L, HealthConnectExportLedger(file()).reserve(listOf(request("a")))[id])
  }

  @Test fun partialRemoteInsertionRetriesTheSameVersionsAndOnlyChangedRecordAdvances() {
    val requests = listOf(request("a", "weight"), request("b", "nutrition"))
    val first = HealthConnectExportLedger(file()).reserve(requests)
    val remote = mutableMapOf("weight" to first.getValue("weight")) // Simulated partial failure.
    val retry = HealthConnectExportLedger(file()).reserve(requests)
    assertEquals(first, retry)
    remote.putAll(retry)
    val edited = HealthConnectExportLedger(file()).reserve(listOf(request("a", "weight"), request("new", "nutrition")))
    assertEquals(2L, edited["weight"]); assertEquals(3L, edited["nutrition"])
    assertEquals(2L, remote["nutrition"])
  }

  @Test fun failedReservationNeverReturnsARevisionOrChangesLastDurableState() {
    val initial = HealthConnectExportLedger(file()).reserve(listOf(request("a")))
    val before = file().readText()
    val failing = HealthConnectExportLedger(file()) { _, _ -> throw IOException("Disk full") }
    assertThrows(IOException::class.java) { failing.reserve(listOf(request("b"))) }
    assertEquals(before, file().readText())
    assertEquals(initial, HealthConnectExportLedger(file()).reserve(listOf(request("a"))))
    assertEquals(3L, HealthConnectExportLedger(file()).reserve(listOf(request("b"))).values.single())
  }

  @Test fun failedInitialReservationAndEmptyExportDoNotCreateLedger() {
    assertEquals(emptyMap<String, Long>(), HealthConnectExportLedger(file()).reserve(emptyList()))
    assertFalse(file().exists())
    assertThrows(IOException::class.java) {
      HealthConnectExportLedger(file()) { _, _ -> throw IOException("Disk full") }.reserve(listOf(request("a")))
    }
    assertFalse(file().exists())
  }

  @Test fun corruptLedgerFailsClosedWithoutErasingVersions() {
    for (contents in listOf("{broken", "{\"schema\":2,\"entries\":{}}", "{\"schema\":1,\"entries\":{\"id\":{\"fingerprint\":\"a\",\"revision\":1}}}")) {
      file().writeText(contents)
      assertThrows(IOException::class.java) { HealthConnectExportLedger(file()).reserve(listOf(request("a"))) }
      assertEquals(contents, file().readText())
    }
  }

  @Test fun conflictingDuplicateIdsAndRevisionOverflowDoNotRewriteLedger() {
    assertThrows(IllegalArgumentException::class.java) {
      HealthConnectExportLedger(file()).reserve(listOf(request("a"), request("b")))
    }
    assertFalse(file().exists())
    val id = request("a").clientRecordId
    file().writeText(JSONObject().put("schema", 1).put("entries", JSONObject().put(id,
      JSONObject().put("fingerprint", "a").put("revision", Long.MAX_VALUE))).toString())
    val before = file().readText()
    assertThrows(IOException::class.java) { HealthConnectExportLedger(file()).reserve(listOf(request("b"))) }
    assertEquals(before, file().readText())
  }

  @Test fun concurrentReservationsSerializeAndKeepEveryIssuedRevision() {
    val ledger = HealthConnectExportLedger(file())
    val executor = Executors.newFixedThreadPool(4)
    try {
      val revisions = executor.invokeAll((1..20).map { index ->
        Callable { ledger.reserve(listOf(request("content-$index"))).values.single() }
      }).map { it.get() }
      assertEquals((2L..21L).toSet(), revisions.toSet())
    } finally { executor.shutdown() }
  }
}
