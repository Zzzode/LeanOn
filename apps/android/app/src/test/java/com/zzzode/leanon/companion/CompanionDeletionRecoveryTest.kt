package com.zzzode.leanon.companion

import com.zzzode.leanon.data.writeBytesAtomically
import com.zzzode.leanon.personal.AtomicPrivateWrite
import com.zzzode.leanon.personal.PersonalCrypto
import com.zzzode.leanon.personal.PersonalFailure
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.io.IOException
import java.nio.file.Files
import javax.crypto.spec.SecretKeySpec

/** Repository state-machine faults using memory transport. No HTTP, listener, account or Keystore claim. */
class CompanionDeletionRecoveryTest {
  private class EncryptedFixtureStore(val file: File) : CompanionStore {
    private val key = SecretKeySpec(ByteArray(32) { it.toByte() }, "AES")
    var failPhase: String? = null
    override fun read() = if (file.exists()) JSONObject(String(PersonalCrypto.localOpen(key, file.readText(), "PUBLIC-deletion"))) else null
    override fun prepare(value: JSONObject, afterCommit: () -> Unit): AtomicPrivateWrite {
      if (failPhase != null && value.optJSONObject("pendingAccountDeletion")?.optString("phase") == failPhase) throw IOException("PUBLIC storage fault")
      return AtomicPrivateWrite(file, PersonalCrypto.localEnvelope(key, value.toString().toByteArray(), "PUBLIC-deletion").toByteArray(), afterCommit)
    }
    override fun write(value: JSONObject) { val prepared = prepare(value) {}; writeBytesAtomically(file, prepared.bytes!!) }
  }
  private class FixturePort : CompanionLocalPort {
    var recordsRevision = 11L; var personalRevision = 22L
    var wipes = 0; var keyFinishes = 0; var failKeys = false; var recreatedLedger = false
    override fun hostData() = JSONObject().put("revision", recordsRevision)
    override fun personalState() = JSONObject().put("revision", personalRevision)
    override fun exportVaultPayload(): JSONObject = throw AssertionError("Deletion must not export health data")
    override fun mergeVaultPayload(payload: JSONObject, metadata: AtomicPrivateWrite, expectedRecordsRevision: Long, expectedPersonalRevision: Long) = throw AssertionError("Deletion must not merge data")
    override fun attachLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long, commitOwner: () -> Unit) {
      if (recordsRevision != expectedRecordsRevision || personalRevision != expectedPersonalRevision) throw PersonalFailure("conflict", "PUBLIC stale CAS")
      commitOwner()
    }
    override fun deleteLocalData() = throw AssertionError("New protocol must use marker transaction")
    override fun deleteAccountLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long, metadata: AtomicPrivateWrite) {
      if (recordsRevision != expectedRecordsRevision || personalRevision != expectedPersonalRevision) throw PersonalFailure("conflict", "PUBLIC stale CAS")
      // Fixture transaction models marker publication; actual three-store journal has separate authority tests.
      writeBytesAtomically(metadata.file, metadata.bytes!!); recordsRevision = 0; personalRevision = 0; wipes++; metadata.afterCommit()
      finishAccountDeletionKeyCleanup()
    }
    override fun finishAccountDeletionKeyCleanup() {
      keyFinishes++
      if (recordsRevision != 0L || personalRevision != 0L || recreatedLedger) throw PersonalFailure("conflict", "PUBLIC recreated file")
      if (failKeys) throw IOException("PUBLIC key cleanup fault")
    }
  }
  private class MemoryRelay : CompanionTransport {
    val calls = mutableListOf<String>()
    var receipt: JSONObject? = null; var loseDeleteResponse = false; var loseAckResponse = false
    var failLogin = false; var mismatchReceipt = false; var beforeDeleteReturn: () -> Unit = {}
    override fun request(method: String, path: String, body: JSONObject?, token: String?): JSONObject {
      calls += "$method $path"
      if (path.endsWith("/receipt")) {
        val result = receipt ?: throw CompanionFailure("deletion_not_found", "PUBLIC absent receipt")
        return JSONObject(result.toString()).apply { if (mismatchReceipt) put("accountId", "PUBLIC-other") }
      }
      if (path == "/v1/sessions") {
        if (failLogin) throw CompanionFailure("unauthorized", "PUBLIC incorrect password")
        return JSONObject().put("accountId", "PUBLIC-account").put("deviceId", body!!.getString("deviceId")).put("vaultId", "PUBLIC-vault")
          .put("token", "A".repeat(43)).put("expiresAt", 100000L).put("deviceAuthorized", true)
      }
      if (path == "/v1/accounts/current") {
        assertNotNull(token)
        receipt = JSONObject().put("version", 1).put("operationId", body!!.getString("operationId")).put("accountId", "PUBLIC-account").put("status", "deleted").put("deletedAt", 2000L)
        beforeDeleteReturn()
        if (loseDeleteResponse) throw IOException("PUBLIC response lost after model commit")
        return JSONObject(receipt.toString())
      }
      if (path.endsWith("/ack")) {
        val result = receipt ?: throw CompanionFailure("deletion_not_found", "PUBLIC absent receipt")
        receipt = null
        if (loseAckResponse) throw IOException("PUBLIC ACK response lost")
        return JSONObject().put("version", 1).put("operationId", result.getString("operationId")).put("status", "acknowledged")
      }
      throw AssertionError("Unexpected model request: $method $path")
    }
  }
  private class Fixture(val directory: File) {
    val store = EncryptedFixtureStore(File(directory, "state.enc")); val port = FixturePort(); val relay = MemoryRelay()
    var clock = 1000L
    fun repository() = CompanionRepository(store, port, { clock }, { relay })
    init {
      repository().configure("http://127.0.0.1:1")
      val saved = store.read()!!
      saved.put("session", JSONObject().put("accountId", "PUBLIC-account").put("deviceId", saved.getString("deviceId")).put("vaultId", "PUBLIC-vault")
        .put("token", "A".repeat(43)).put("expiresAt", 10000L).put("deviceAuthorized", true).put("login", "public-login").put("displayName", "PUBLIC"))
      store.write(saved)
    }
    fun intent() = store.read()!!.getJSONObject("pendingAccountDeletion")
  }
  private fun withFixture(test: (Fixture) -> Unit) {
    val directory = Files.createTempDirectory("leanon-deletion-model-").toFile()
    try { test(Fixture(directory)) } finally { directory.deleteRecursively() }
  }
  @Test fun committedDeleteLostResponseReopensAndProbesBeforeExpiredSession() = withFixture { f ->
    f.relay.loseDeleteResponse = true
    assertThrows(IOException::class.java) { f.repository().deleteAccount("PUBLIC password", false) }
    assertEquals("prepared", f.intent().getString("phase")); val proof = f.intent().getString("proof")
    assertFalse(f.store.file.readText().contains(proof)); assertFalse(f.store.file.readText().contains("PUBLIC password"))
    f.clock = 20000; f.relay.calls.clear()
    val result = f.repository().getState()
    assertTrue(result.getJSONObject("runtime").isNull("accountDeletion")); assertEquals(0, f.port.wipes)
    assertEquals(2, f.relay.calls.size); assertTrue(f.relay.calls.first().endsWith("/receipt")); assertTrue(f.relay.calls.last().endsWith("/ack"))
  }
  @Test fun lostAckResponseReopensLocalCompleteWithoutSecondWipe() = withFixture { f ->
    f.relay.loseAckResponse = true
    assertThrows(IOException::class.java) { f.repository().deleteAccount("PUBLIC password", true) }
    assertEquals("local-complete", f.intent().getString("phase")); assertEquals(1, f.port.wipes)
    val finishes = f.port.keyFinishes; f.relay.calls.clear()
    assertTrue(f.repository().getState().getJSONObject("runtime").isNull("accountDeletion"))
    assertEquals(1, f.port.wipes); assertEquals(finishes, f.port.keyFinishes); assertEquals(1, f.relay.calls.size); assertTrue(f.relay.calls.single().endsWith("/ack"))
  }
  @Test fun failedConfirmedIntentSavePreservesPreparedUntilReopen() = withFixture { f ->
    f.store.failPhase = "confirmed"
    assertThrows(IOException::class.java) { f.repository().deleteAccount("PUBLIC password", true) }
    assertEquals("prepared", f.intent().getString("phase")); assertEquals(0, f.port.wipes)
    f.store.failPhase = null
    assertTrue(f.repository().getState().getJSONObject("runtime").isNull("accountDeletion")); assertEquals(1, f.port.wipes)
  }
  @Test fun changedRevisionRequiresFreshChoiceAndKeepLocalNeverWipes() = withFixture { f ->
    f.relay.beforeDeleteReturn = { f.port.recordsRevision = 12 }
    assertEquals("conflict", assertThrows(CompanionFailure::class.java) { f.repository().deleteAccount("PUBLIC password", true) }.code)
    assertEquals("confirmed", f.intent().getString("phase")); assertEquals(0, f.port.wipes)
    assertTrue(f.repository().getState().getJSONObject("runtime").getJSONObject("accountDeletion").getBoolean("localDataChanged"))
    assertThrows(CompanionFailure::class.java) { f.repository().confirmAccountDeletionLocalData(false, 11, 22) }
    assertTrue(f.repository().confirmAccountDeletionLocalData(false, 12, 22).getJSONObject("runtime").isNull("accountDeletion"))
    assertEquals(12, f.port.recordsRevision); assertEquals(0, f.port.wipes)
  }
  @Test fun markerSurvivesKeyFaultAndReopenRetriesOnlyKeys() = withFixture { f ->
    f.port.failKeys = true
    assertThrows(IOException::class.java) { f.repository().deleteAccount("PUBLIC password", true) }
    assertEquals("confirmed", f.intent().getString("phase")); assertTrue(f.intent().getBoolean("localDataCleared")); assertEquals(1, f.port.wipes)
    f.port.failKeys = false
    assertTrue(f.repository().getState().getJSONObject("runtime").isNull("accountDeletion")); assertEquals(1, f.port.wipes)
  }
  @Test fun recreatedLedgerAfterMarkerReportsConflictAndKeepLocalPreservesIt() = withFixture { f ->
    f.port.failKeys = true
    assertThrows(IOException::class.java) { f.repository().deleteAccount("PUBLIC password", true) }
    f.port.failKeys = false; f.port.recreatedLedger = true
    val reopened = f.repository(); val result = reopened.getState().getJSONObject("runtime")
    assertEquals("account-deletion-key-cleanup-conflict", result.getString("errorCode")); assertTrue(result.getJSONObject("accountDeletion").getBoolean("localDataChanged"))
    assertThrows(CompanionFailure::class.java) { reopened.confirmAccountDeletionLocalData(true, 0, 0) }
    val finishes = f.port.keyFinishes
    assertTrue(reopened.confirmAccountDeletionLocalData(false, 0, 0).getJSONObject("runtime").isNull("accountDeletion"))
    assertTrue(f.port.recreatedLedger); assertEquals(1, f.port.wipes); assertEquals(finishes, f.port.keyFinishes)
  }
  @Test fun absentReceiptAndWrongPasswordNeverInferDeletionOrReleaseIntent() = withFixture { f ->
    f.relay.failLogin = true
    assertEquals("unauthorized", assertThrows(CompanionFailure::class.java) { f.repository().deleteAccount("PUBLIC incorrect password", true) }.code)
    assertEquals("prepared", f.intent().getString("phase")); f.relay.calls.clear()
    assertEquals("deletion_not_found", f.repository().getState().getJSONObject("runtime").getString("errorCode"))
    assertEquals(1, f.relay.calls.size); assertTrue(f.relay.calls.single().endsWith("/receipt")); assertEquals(0, f.port.wipes)
    assertThrows(CompanionFailure::class.java) { f.repository().configure("http://127.0.0.1:2") }
  }
  @Test fun mismatchedAccountReceiptCannotAuthorizeLocalCleanup() = withFixture { f ->
    f.relay.mismatchReceipt = true
    assertThrows(IOException::class.java) { f.repository().deleteAccount("PUBLIC password", true) }
    assertEquals("prepared", f.intent().getString("phase")); assertEquals(0, f.port.wipes)
    assertFalse(f.relay.calls.any { it.endsWith("/ack") })
  }
}
