package com.zzzode.leanon.companion

import com.zzzode.leanon.data.writeBytesAtomically
import com.zzzode.leanon.personal.AtomicPrivateWrite
import com.zzzode.leanon.personal.BackupCodec
import com.zzzode.leanon.personal.PersonalCrypto
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.util.UUID
import javax.crypto.spec.SecretKeySpec

/** Pure storage faults plus opt-in integration against a separately approved isolated QA relay. */
class CompanionRepositoryHttpTest {
  private class TestStore(val file: File) : CompanionStore {
    private val key = SecretKeySpec(ByteArray(32) { it.toByte() }, "AES") // PUBLIC test key; Android Keystore covered by device tests.
    var failIncomingCommit = false
    var failPreparedIntent = false
    override fun read(): JSONObject? = if (file.exists()) JSONObject(String(PersonalCrypto.localOpen(key, file.readText(), "companion-test"))) else null
    override fun prepare(value: JSONObject, afterCommit: () -> Unit): AtomicPrivateWrite {
      if (failPreparedIntent && value.optJSONObject("pendingAccountDeletion")?.optString("phase") == "prepared") throw IOException("PUBLIC injected intent-save failure")
      if (failIncomingCommit && value.getJSONObject("pendingAcks").keys().asSequence().any { value.getJSONObject("pendingAcks").getJSONArray(it).length() > 0 }) {
        failIncomingCommit = false; throw IOException("PUBLIC injected pre-write failure")
      }
      return AtomicPrivateWrite(file, PersonalCrypto.localEnvelope(key, value.toString().toByteArray(), "companion-test").toByteArray(), afterCommit)
    }
    override fun write(value: JSONObject) { val write = prepare(value) {}; writeBytesAtomically(file, write.bytes!!) }
  }
  private class TestPort(private var payload: JSONObject) : CompanionLocalPort {
    var merges = 0
    var blocked = false
    var failDeletion = true
    var localDeleted = false
    var failPreviewCleanup = false
    override fun clearPeerPreviews() { if (failPreviewCleanup) throw IOException("PUBLIC preview unlink failure") }
    override fun requireAvailable() { if (blocked) throw IOException("PUBLIC transaction recovery gate") }
    override fun exportVaultPayload() = JSONObject(payload.toString())
    override fun hostData() = BackupCodec.hostData(payload)
    override fun personalState() = JSONObject(payload.getJSONObject("personal").toString())
    override fun mergeVaultPayload(payload: JSONObject, metadata: AtomicPrivateWrite, expectedRecordsRevision: Long, expectedPersonalRevision: Long) {
      assertEquals(expectedRecordsRevision, this.payload.getJSONObject("records").getLong("revision"))
      assertEquals(expectedPersonalRevision, this.payload.getJSONObject("personal").getLong("revision"))
      BackupCodec.validate(payload); writeBytesAtomically(metadata.file, metadata.bytes!!)
      this.payload = JSONObject(payload.toString()); metadata.afterCommit(); merges++
    }
    override fun attachLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long, commitOwner: () -> Unit) {
      assertEquals(expectedRecordsRevision, payload.getJSONObject("records").getLong("revision"))
      assertEquals(expectedPersonalRevision, payload.getJSONObject("personal").getLong("revision")); commitOwner()
    }
    override fun deleteLocalData() { if (failDeletion) throw IOException("PUBLIC injected local deletion failure"); localDeleted = true }
    override fun deleteAccountLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long, metadata: AtomicPrivateWrite) {
      if (failDeletion) throw IOException("PUBLIC injected local deletion failure")
      assertEquals(expectedRecordsRevision, payload.getJSONObject("records").getLong("revision")); assertEquals(expectedPersonalRevision, payload.getJSONObject("personal").getLong("revision"))
      writeBytesAtomically(metadata.file, metadata.bytes!!); metadata.afterCommit(); localDeleted = true
    }
    override fun finishAccountDeletionKeyCleanup() {}
  }
  private fun payload(remote: Boolean = false): JSONObject {
    val fixture = JSONObject(javaClass.getResource("/companion/public-vault-merge-v1.json")!!.readText())
    return JSONObject(fixture.getJSONArray("cases").getJSONObject(0).getJSONObject(if (remote) "remote" else "local").getJSONObject("payload").toString())
  }
  private fun seedSession(store: TestStore, authorized: Boolean): JSONObject {
    val saved = store.read()!!
    saved.put("session", JSONObject().put("accountId", "PUBLIC-owner").put("deviceId", saved.getString("deviceId"))
      .put("vaultId", "PUBLIC-vault").put("token", "A".repeat(43)).put("expiresAt", System.currentTimeMillis() + 60000)
      .put("deviceAuthorized", authorized).put("login", "public-login").put("displayName", "PUBLIC"))
    store.write(saved); return saved
  }
  @Test fun failedPreparedIntentWriteStopsBeforeReceiptOrDeleteTransport() {
    val directory = Files.createTempDirectory("leanon-companion-intent-fault-").toFile()
    try {
      val store = TestStore(File(directory, "state.enc")); val port = TestPort(payload())
      CompanionRepository(store, port, System::currentTimeMillis).configure("http://127.0.0.1:1")
      seedSession(store, true); val before = store.file.readBytes(); store.failPreparedIntent = true
      val error = assertThrows(IOException::class.java) { CompanionRepository(store, port, System::currentTimeMillis).deleteAccount("PUBLIC password never saved", true) }
      assertEquals("PUBLIC injected intent-save failure", error.message)
      assertArrayEquals(before, store.file.readBytes()); assertTrue(store.read()!!.isNull("pendingAccountDeletion")); assertFalse(port.localDeleted)
      assertFalse(store.file.readText().contains("PUBLIC password never saved"))
      // The injected storage exception wins before the unreachable endpoint is contacted.
    } finally { directory.deleteRecursively() }
  }
  @Test fun unauthorizedDeviceCannotPrepareDeletionAndCanStillSignOut() {
    val directory = Files.createTempDirectory("leanon-companion-unapproved-delete-").toFile()
    try {
      val store = TestStore(File(directory, "state.enc")); val port = TestPort(payload())
      CompanionRepository(store, port, System::currentTimeMillis).configure("http://127.0.0.1:1")
      seedSession(store, false); val before = store.file.readBytes()
      val error = assertThrows(CompanionFailure::class.java) { CompanionRepository(store, port, System::currentTimeMillis).deleteAccount("PUBLIC password", true) }
      assertEquals("not-authorized", error.code); assertArrayEquals(before, store.file.readBytes())
      assertTrue(store.read()!!.isNull("pendingAccountDeletion")); assertFalse(port.localDeleted)
      val saved = store.read()!!; saved.getJSONObject("session").put("expiresAt", 0); store.write(saved)
      val signedOut = CompanionRepository(store, port, System::currentTimeMillis).logout()
      assertTrue(signedOut.getJSONObject("companion").isNull("account")); assertTrue(store.read()!!.isNull("pendingAccountDeletion"))
    } finally { directory.deleteRecursively() }
  }
  @Test fun previewCleanupFailureCannotRetainAuthenticatedPeerState() {
    val directory = Files.createTempDirectory("leanon-companion-preview-purge-").toFile()
    try {
      val store = TestStore(File(directory, "state.enc")); val port = TestPort(payload())
      CompanionRepository(store, port, System::currentTimeMillis).configure("http://127.0.0.1:8787")
      val saved = store.read()!!
      saved.put("session", JSONObject().put("accountId", "PUBLIC-owner").put("deviceId", saved.getString("deviceId")).put("vaultId", "PUBLIC-vault").put("token", "A".repeat(43)).put("expiresAt", System.currentTimeMillis() + 60000).put("deviceAuthorized", true))
      saved.put("family", JSONObject().put("id", "PUBLIC-family").put("kind", "family").put("epoch", 1).put("members", org.json.JSONArray(listOf("PUBLIC-owner", "PUBLIC-peer"))).put("grants", JSONObject()))
      saved.getJSONObject("peerData").put("photos", JSONObject().put("PUBLIC", true))
      saved.getJSONObject("peerPhotos").put("PUBLIC-photo", JSONObject())
      saved.getJSONObject("groupKeys").put("PUBLIC-family", CompanionCrypto.encode(ByteArray(32)))
      saved.getJSONArray("messages").put(JSONObject().put("id", "PUBLIC-message"))
      store.write(saved); port.failPreviewCleanup = true
      assertThrows(IOException::class.java) { CompanionRepository(store, port, System::currentTimeMillis).logout() }
      val purged = store.read()!!
      assertTrue(purged.isNull("session")); assertTrue(purged.isNull("family"))
      for (field in listOf("peerData", "peerPhotos", "groupKeys", "pendingAcks")) assertEquals(0, purged.getJSONObject(field).length())
      assertEquals(0, purged.getJSONArray("messages").length()); assertTrue(purged.getBoolean("pendingPeerPreviewCleanup"))
      purged.remove("pendingLogout"); store.write(purged)
      port.failPreviewCleanup = false
      assertTrue(CompanionRepository(store, port, System::currentTimeMillis).getState().getJSONObject("companion").isNull("account"))
      assertFalse(store.read()!!.has("pendingPeerPreviewCleanup"))
    } finally { directory.deleteRecursively() }
  }
  @Test fun transactionRecoveryBlocksIndependentMetadataWritesAndCorruptFileIsPreserved() {
    val directory = Files.createTempDirectory("leanon-companion-gate-").toFile()
    try {
      val store = TestStore(File(directory, "state.enc")); val port = TestPort(payload())
      val repository = CompanionRepository(store, port, System::currentTimeMillis)
      repository.configure("http://127.0.0.1:8787")
      val before = store.file.readBytes(); port.blocked = true
      assertThrows(IOException::class.java) { repository.configure("http://127.0.0.1:8788") }
      assertThrows(IOException::class.java) { repository.getState() }
      assertArrayEquals(before, store.file.readBytes())
      port.blocked = false; store.file.writeText("PUBLIC corrupted encrypted file")
      val reopened = CompanionRepository(store, port, System::currentTimeMillis)
      assertThrows(CompanionFailure::class.java) { reopened.getState() }
      assertEquals("PUBLIC corrupted encrypted file", store.file.readText())
    } finally { directory.deleteRecursively() }
  }
  @Test fun realRelayCiphertextPairingExplicitAttachmentAndDurableReceipt() {
    val cloudflare = System.getenv("LEANON_CLOUDFLARE_QA_ENDPOINT") != null
    val endpoint = System.getenv("LEANON_CLOUDFLARE_QA_ENDPOINT") ?: System.getenv("LEANON_COMPANION_QA_ENDPOINT")
    assumeTrue("Set LEANON_COMPANION_QA_ENDPOINT for a separate random-port isolated QA relay", endpoint != null && runCatching { val uri = java.net.URI(endpoint); uri.host == "127.0.0.1" && uri.port in 1..65535 && uri.port != 8787 }.getOrDefault(false))
    val directory = Files.createTempDirectory("leanon-companion-public-").toFile()
    val aStore = TestStore(File(directory, "alice.enc")); val bStore = TestStore(File(directory, "bob.enc")); val dStore = TestStore(File(directory, "alice-device.enc"))
    val ownerPayload = payload()
    val aPort = TestPort(ownerPayload); val bPort = TestPort(payload()); val dPort = TestPort(payload(true))
    val alice = CompanionRepository(aStore, aPort, System::currentTimeMillis)
    val bob = CompanionRepository(bStore, bPort, System::currentTimeMillis)
    val device = CompanionRepository(dStore, dPort, System::currentTimeMillis)
    val loginA = if (cloudflare) "cloudflare-owner" else "public-a-" + UUID.randomUUID(); val loginB = if (cloudflare) "cloudflare-partner" else "public-b-" + UUID.randomUUID(); val password = "PUBLIC fictional password 2026"
    try {
      assertFalse(aStore.file.exists()); assertTrue(alice.getState().getJSONObject("runtime").isNull("endpoint")); assertFalse(aStore.file.exists())
      alice.configure(endpoint!!); bob.configure(endpoint); device.configure(endpoint)
      alice.register(loginA, password, if (cloudflare) "o".repeat(43) else null); bob.register(loginB, password, if (cloudflare) "p".repeat(43) else null)
      assertTrue(alice.getState().getJSONObject("runtime").isNull("localDataAccountId")); assertEquals(0, aPort.merges)
      val code = alice.createInvitation("family").getString("invitationCode")
      assertEquals(code, alice.createInvitation("family").getString("invitationCode"))
      bob.acceptInvitation(code); val familyInvite = CompanionCrypto.parseInvitationCode(code).first
      alice.confirmInvitation(familyInvite); bob.getState()
      assertEquals(0, alice.getState().getJSONObject("companion").getJSONObject("shareSettings").getJSONArray("categories").length())
      alice.setSharing(listOf("encouragement")); bob.setSharing(listOf("encouragement"))
      val snapshot = alice.getState().getJSONObject("companion").getJSONObject("peerSnapshot")
      assertEquals("encouragement", snapshot.getJSONArray("sharedCategories").getString(0))
      val sent = alice.sendEncouragement("PUBLIC fictional encouragement")
      assertEquals("pending", sent.getJSONObject("companion").getJSONArray("messages").getJSONObject(0).getString("status"))
      bStore.failIncomingCommit = true
      assertThrows(IOException::class.java) { bob.sync() }
      assertEquals("pending", alice.sync().getJSONObject("companion").getJSONArray("messages").getJSONObject(0).getString("status"))
      bob.sync()
      assertEquals("delivered", alice.sync().getJSONObject("companion").getJSONArray("messages").getJSONObject(0).getString("status"))
      assertFalse(aStore.file.readText().contains("fictional encouragement")); assertFalse(bStore.file.readText().contains("fictional encouragement"))
      val baseline = aPort.exportVaultPayload()
      alice.attachLocalData(baseline.getJSONObject("records").getLong("revision"), baseline.getJSONObject("personal").getLong("revision")); alice.sync()
      val deviceCode = alice.createInvitation("device").getString("invitationCode")
      device.login(loginA, password); assertFalse(device.getState().getJSONObject("runtime").getBoolean("deviceAuthorized"))
      device.acceptInvitation(deviceCode); alice.confirmInvitation(CompanionCrypto.parseInvitationCode(deviceCode).first)
      assertTrue(device.getState().getJSONObject("runtime").getBoolean("deviceAuthorized"))
      val unconsentedDevice = device.sync(); assertEquals(0, dPort.merges) // Keyring-only until explicit health attachment.
      assertEquals("outgoing", unconsentedDevice.getJSONObject("companion").getJSONArray("messages").getJSONObject(0).getString("direction"))
      assertEquals("delivered", unconsentedDevice.getJSONObject("companion").getJSONArray("messages").getJSONObject(0).getString("status"))
      assertTrue(device.getState().getJSONObject("runtime").isNull("localDataAccountId"))
      assertEquals(0, device.getState().getJSONObject("companion").getJSONObject("shareSettings").getJSONArray("categories").length())
      assertThrows(CompanionFailure::class.java) { device.sendEncouragement("No local consent") }
      val devicePayload = dPort.exportVaultPayload()
      device.attachLocalData(devicePayload.getJSONObject("records").getLong("revision"), devicePayload.getJSONObject("personal").getLong("revision")); device.sync(); alice.sync()
      assertEquals(2, dPort.exportVaultPayload().getJSONObject("records").getJSONArray("weights").length())
      assertEquals(2, aPort.exportVaultPayload().getJSONObject("records").getJSONArray("weights").length())
      val activeReopened = CompanionRepository(aStore, aPort, System::currentTimeMillis)
      activeReopened.logout(); activeReopened.login(loginA, password); activeReopened.sync()
      assertFalse(activeReopened.getState().getJSONObject("companion").isNull("binding"))
      assertEquals("delivered", activeReopened.getState().getJSONObject("companion").getJSONArray("messages").getJSONObject(0).getString("status"))
      // The original object is intentionally not used after a separate repository writes its state.
      val currentAlice = activeReopened
      bob.setSharing(emptyList()); currentAlice.sync()
      assertEquals(0, currentAlice.getState().getJSONObject("companion").getJSONArray("messages").length())
      currentAlice.unlink(); assertTrue(bob.getState().getJSONObject("companion").isNull("binding"))
      val persisted = CompanionRepository(aStore, aPort, System::currentTimeMillis)
      assertEquals(loginA, persisted.getState().getJSONObject("companion").getJSONObject("account").getString("displayName"))
      assertFalse(persisted.logout().getJSONObject("companion").has("token"))
      persisted.login(loginA, password); assertTrue(persisted.getState().getJSONObject("runtime").getBoolean("deviceAuthorized"))
      assertThrows(IOException::class.java) { persisted.deleteAccount(password, true) }
      if (cloudflare) repeat(24) { if (aStore.read()!!.optJSONObject("pendingAccountDeletion")?.optString("phase") == "prepared") persisted.getState() }
      assertEquals("confirmed", aStore.read()!!.getJSONObject("pendingAccountDeletion").getString("phase"))
      assertTrue(persisted.getState().getJSONObject("companion").isNull("account"))
      assertEquals("unavailable", persisted.getState().getJSONObject("runtime").getString("errorCode"))
      aPort.failDeletion = false
      val afterDeleteRestart = CompanionRepository(aStore, aPort, System::currentTimeMillis)
      assertTrue(afterDeleteRestart.getState().getJSONObject("companion").isNull("account"))
      assertTrue(aPort.localDeleted); assertTrue(aStore.read()!!.isNull("pendingAccountDeletion"))
    } finally {
      for ((store, login) in listOf(aStore to loginA, bStore to loginB)) runCatching {
        store.read()?.let { state ->
          val session = state.optJSONObject("session") ?: CompanionHttp(endpoint!!).request("POST", "/v1/sessions", JSONObject().put("login", login).put("password", password).put("deviceId", state.getString("deviceId")).put("deviceProof", state.getString("deviceProof")))
          CompanionHttp(endpoint!!).request("DELETE", "/v1/accounts/current", JSONObject().put("password", password).put("operationId", UUID.randomUUID().toString()).put("proof", CompanionCrypto.encode(ByteArray(32))), session.getString("token"))
        }
      }
      directory.deleteRecursively()
    }
  }
}
