package com.zzzode.leanon.companion

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

/** Real relay authority. Credentials and all decrypted caches remain in one encrypted native file. */
internal class CompanionRepository internal constructor(
  private val store: CompanionStore,
  private val local: CompanionLocalPort,
  private val now: () -> Long,
  private val transport: (String) -> CompanionTransport = ::CompanionHttp,
) {
  constructor(context: Context, local: CompanionLocalPort) : this(SecureCompanionStore(context), local, System::currentTimeMillis)
  private var initialError: Exception? = null
  private var deletionKeyCleanupConflict = false
  private var wireProtocol = 1
  private var state = try { (store.read() ?: empty()).also(CompanionValidation::state) } catch (error: Exception) { initialError = error; empty() }
  private fun ready() { if (initialError != null) throw CompanionFailure("unavailable", "Saved companion state is unavailable; encrypted file preserved"); local.requireAvailable() }
  private fun empty() = JSONObject().put("version", 1).put("deviceId", UUID.randomUUID().toString()).put("deviceProof", CompanionCrypto.encode(CompanionCrypto.randomKey()))
    .put("endpoint", JSONObject.NULL).put("session", JSONObject.NULL).put("localDataAccountId", JSONObject.NULL)
    .put("localDataRealm", JSONObject.NULL).put("localConsent", JSONObject()).put("accountKeys", JSONObject()).put("vaultMetadata", JSONObject()).put("groupKeys", JSONObject()).put("invitations", JSONArray())
    .put("invitationSecrets", JSONObject()).put("family", JSONObject.NULL).put("peerData", JSONObject()).put("peerPhotos", JSONObject())
    .put("messages", JSONArray()).put("cursors", JSONObject()).put("outbox", JSONArray()).put("applied", JSONObject()).put("pendingAcks", JSONObject())
    .put("revokedFamilies", JSONObject()).put("sentHashes", JSONObject()).put("lastSyncAt", JSONObject.NULL).put("errorCode", JSONObject.NULL)
    .put("pendingAccountDeletion", JSONObject.NULL)
  private fun copy() = JSONObject(state.toString())
  private fun save(next: JSONObject) {
    ready(); CompanionValidation.state(next)
    try { store.write(next); state = next }
    catch (error: com.zzzode.leanon.data.AtomicDurabilityUncertain) {
      try { state = (store.read() ?: throw IOException("Missing committed state")).also(CompanionValidation::state) }
      catch (readError: Exception) { initialError = readError }
      throw CompanionFailure("unavailable", "Companion durability is uncertain; retry unchanged action")
    }
    cleanupPeerPreviews()
  }
  private fun cleanupPeerPreviews() {
    if (!state.optBoolean("pendingPeerPreviewCleanup", false)) return
    local.clearPeerPreviews()
    val finished = copy(); finished.remove("pendingPeerPreviewCleanup")
    store.write(finished); state = finished
  }
  private fun noPendingDeletion() { if (state.optJSONObject("pendingAccountDeletion") != null) throw CompanionFailure("conflict", "Complete the pending account deletion first") }
  private fun session(): JSONObject { ready(); noPendingDeletion(); return state.optJSONObject("session")?.takeIf { it.getLong("expiresAt") > now() }
    ?: throw CompanionFailure("unauthorized", "Sign in again to continue") }
  private fun endpoint(): String { ready(); return state.opt("endpoint") as? String ?: throw CompanionFailure("not-configured", "Configure a relay first") }
  private fun accountKey(account: String = accountId()) = endpoint() + "#" + account
  private fun consentKey(group: JSONObject) = accountKey() + "#" + group.getString("id")
  private fun outgoing(group: JSONObject, source: JSONObject = state): List<String> = source.optJSONObject("localConsent")?.optJSONArray(consentKey(group))?.let(::strings)?.filter { it in grants(group, accountId(), peerId(group)) } ?: emptyList()
  private fun accountId() = session().getString("accountId")
  private fun request(method: String, path: String, body: JSONObject? = null): JSONObject = transport(endpoint()).request(method, path, body, session().getString("token"))
  private fun iso(value: Long = now()) = Instant.ofEpochMilli(value).toString()
  private fun ownAttached() = state.optString("localDataRealm") == state.optString("endpoint") && state.optString("localDataAccountId") == state.optJSONObject("session")?.optString("accountId") && state.optJSONObject("session") != null
  private fun strings(value: JSONArray): List<String> = (0 until value.length()).map { value.getString(it) }
  private fun rows(value: JSONArray): List<JSONObject> = (0 until value.length()).map { value.getJSONObject(it) }
  private fun peerId(group: JSONObject): String = strings(group.getJSONArray("members")).single { it != accountId() }
  private fun grants(group: JSONObject, sender: String, receiver: String): List<String> = group.optJSONObject("grants")?.optJSONObject(sender)?.optJSONArray(receiver)?.let(::strings) ?: emptyList()
  private fun key(group: JSONObject): ByteArray = if (group.getString("kind") == "vault") CompanionCrypto.decode(state.getJSONObject("accountKeys").opt(accountKey()), 32)
    else CompanionCrypto.decode(state.getJSONObject("groupKeys").opt(group.getString("id")), 32)
  private fun clearPeer(next: JSONObject) { next.put("pendingPeerPreviewCleanup", true).put("family", JSONObject.NULL).put("peerData", JSONObject()).put("peerPhotos", JSONObject()).put("messages", JSONArray()).put("groupKeys", JSONObject()).put("pendingAcks", JSONObject()) }
  private fun signedOut(next: JSONObject) { clearPeer(next); next.put("cursors", JSONObject()).put("applied", JSONObject()).put("session", JSONObject.NULL).put("invitations", JSONArray()).put("invitationSecrets", JSONObject()).put("outbox", JSONArray()).put("errorCode", JSONObject.NULL) }
  @Synchronized fun getState(): JSONObject {
    ready()
    if (state.optJSONObject("pendingAccountDeletion") != null) {
      return try { recoverAccountDeletion(); response() } catch (error: Exception) {
        response().apply { getJSONObject("runtime").put("syncState", "error").put("errorCode", if (error is CompanionFailure) error.code else "unavailable") }
      }
    }
    cleanupPeerPreviews()
    if (state.optBoolean("pendingLocalDeletion", false)) {
      try { local.deleteLocalData(); val finished = copy(); finished.remove("pendingLocalDeletion"); finished.put("errorCode", JSONObject.NULL); save(finished) }
      catch (_: Exception) { return response().apply { getJSONObject("runtime").put("syncState", "error").put("errorCode", "local-deletion-pending") } }
    }
    retryLogout()
    if (state.optJSONObject("session")?.optLong("expiresAt", 0)?.let { it > now() } == true) {
      try { refresh() } catch (error: Exception) {
        if (error is CompanionFailure && error.code in listOf("unauthorized", "not-authorized")) { val revoked = copy(); signedOut(revoked); revoked.put("errorCode", "unauthorized"); save(revoked); return response() }
        return response().apply { getJSONObject("runtime").put("syncState", "offline").put("errorCode", if (error is CompanionFailure) error.code else "unavailable") }
      }
    }
    if (state.optJSONObject("session")?.optLong("expiresAt", 0)?.let { it <= now() } == true) { val expired = copy(); signedOut(expired); expired.put("errorCode", "unauthorized"); save(expired) }
    return response()
  }
  private fun response(): JSONObject {
    val pendingDeletion = state.optJSONObject("pendingAccountDeletion")
    val active = state.optJSONObject("session")?.takeIf { it.getLong("expiresAt") > now() && pendingDeletion == null }; val family = if (active != null) state.optJSONObject("family") else null
    val own = active?.getString("accountId"); val peer = if (family != null && own != null) strings(family.getJSONArray("members")).singleOrNull { it != own } else null
    val share = if (family != null && own != null && peer != null) outgoing(family) else emptyList()
    val mutual = family != null && own != null && peer != null && share.toSet() == grants(family, peer, own).toSet()
    val invitations = JSONArray()
    if (active != null) for (invite in rows(state.getJSONArray("invitations"))) {
      if (invite.getLong("expiresAt") <= now() || invite.optString("status") !in listOf("open", "pending")) continue
      invitations.put(JSONObject().put("id", invite.getString("id")).put("kind", invite.getString("kind"))
        .put("direction", if (invite.getString("creatorId") == own && invite.getString("creatorDeviceId") == state.getString("deviceId")) "outgoing" else "incoming")
        .put("status", if (invite.getString("status") == "open") "pending" else "awaiting-confirmation").put("expiresAt", iso(invite.getLong("expiresAt")))
        .put("recipientId", invite.opt("recipientId") ?: JSONObject.NULL).put("recipientDeviceId", invite.opt("recipientDeviceId") ?: JSONObject.NULL))
    }
    val companion = JSONObject().put("version", 1).put("account", if (active == null) JSONObject.NULL else JSONObject().put("id", own).put("displayName", active.getString("displayName")))
      .put("sessionExpiresAt", active?.let { iso(it.getLong("expiresAt")) } ?: JSONObject.NULL)
      .put("binding", if (family == null || peer == null) JSONObject.NULL else JSONObject().put("id", family.getString("id")).put("peer", JSONObject().put("id", peer).put("displayName", peer)).put("createdAt", family.getString("observedAt")))
      .put("shareSettings", JSONObject().put("mutual", mutual).put("categories", JSONArray(share)))
      .put("peerSnapshot", if (family == null) JSONObject.NULL else peerSnapshot(state))
      .put("invitations", invitations).put("messages", if (family == null) JSONArray() else state.getJSONArray("messages"))
    val runtime = JSONObject().put("endpoint", state.opt("endpoint") ?: JSONObject.NULL).put("deviceAuthorized", active?.optBoolean("deviceAuthorized") ?: false)
      .put("syncState", if (state.isNull("errorCode")) "idle" else "error").put("pendingChanges", state.getJSONArray("outbox").length())
      .put("lastSyncAt", state.opt("lastSyncAt") ?: JSONObject.NULL).put("nativeNow", iso()).put("errorCode", state.opt("errorCode") ?: JSONObject.NULL)
      .put("localDataAccountId", state.opt("localDataAccountId") ?: JSONObject.NULL)
      .put("accountDeletion", pendingDeletion?.let { JSONObject().put("phase", it.getString("phase")).put("accountId", it.getString("accountId")).put("displayName", it.getString("displayName")).put("deleteLocalData", it.getBoolean("deleteLocalData")).put("localDataChanged", deletionLocalDataChanged(it)) } ?: JSONObject.NULL)
    return JSONObject().put("companion", companion).put("runtime", runtime)
  }
  @Synchronized fun configure(endpoint: String): JSONObject {
    noPendingDeletion()
    if (state.optJSONObject("session") != null) throw CompanionFailure("conflict", "Sign out before changing the relay")
    val normalized = CompanionHttp.validateEndpoint(endpoint); val next = copy()
    if (state.optString("endpoint") != normalized) {
      clearPeer(next); next.put("localDataAccountId", JSONObject.NULL).put("localDataRealm", JSONObject.NULL).put("localConsent", JSONObject())
      next.put("cursors", JSONObject()).put("vaultMetadata", JSONObject()).put("sentHashes", JSONObject()).put("outbox", JSONArray()).put("applied", JSONObject()).put("invitations", JSONArray()).put("invitationSecrets", JSONObject())
    }
    next.put("endpoint", normalized); save(next); return response()
  }
  @Synchronized fun register(login: String, password: String, admissionToken: String? = null): JSONObject = authenticate(login, password, true, admissionToken)
  @Synchronized fun login(login: String, password: String): JSONObject = authenticate(login, password, false)
  private fun authenticate(login: String, password: String, register: Boolean, admissionToken: String? = null): JSONObject {
    noPendingDeletion()
    if (state.optBoolean("pendingLocalDeletion", false)) throw CompanionFailure("unavailable", "Local account deletion must complete first")
    retryLogout()
    if (state.optJSONObject("session") != null) throw CompanionFailure("conflict", "Sign out before using another account")
    val normalizedLogin = login.trim().lowercase(java.util.Locale.ROOT)
    val pendingKeyId = CompanionCrypto.hash((endpoint() + "#" + normalizedLogin).toByteArray(Charsets.UTF_8))
    if (register) {
      val prepared = copy(); val pendingKeys = prepared.optJSONObject("pendingAccountKeys") ?: JSONObject().also { prepared.put("pendingAccountKeys", it) }
      if (!pendingKeys.has(pendingKeyId)) pendingKeys.put(pendingKeyId, CompanionCrypto.encode(CompanionCrypto.randomKey()))
      save(prepared)
    }
    val credentials = JSONObject().put("login", login).put("password", password).put("deviceId", state.getString("deviceId")).put("deviceProof", state.getString("deviceProof"))
    admissionToken?.let { if (!it.matches(Regex("[A-Za-z0-9_-]{43}"))) throw CompanionFailure("invalid-request", "Invalid admission ticket"); credentials.put("admissionToken", it) }
    val dto = transport(endpoint()).request("POST", if (register) "/v1/accounts" else "/v1/sessions", credentials)
    CompanionValidation.session(dto); val next = copy(); dto.put("displayName", login.trim().take(100)).put("login", normalizedLogin); next.put("session", dto).put("errorCode", JSONObject.NULL)
    val pendingKey = next.optJSONObject("pendingAccountKeys")?.opt(pendingKeyId)
    if (pendingKey != null && dto.getBoolean("deviceAuthorized") && !next.getJSONObject("accountKeys").has(accountKey(dto.getString("accountId")))) {
      CompanionCrypto.decode(pendingKey, 32).fill(0); next.getJSONObject("accountKeys").put(accountKey(dto.getString("accountId")), pendingKey)
      next.getJSONObject("pendingAccountKeys").remove(pendingKeyId)
    }
    // Authentication never attaches or uploads the currently saved health records.
    save(next); refresh(); return response()
  }
  @Synchronized fun attachLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long): JSONObject {
    val account = accountId(); if (!session().getBoolean("deviceAuthorized")) throw CompanionFailure("not-authorized", "Confirm this device before attaching data")
    if (ownAttached()) return response()
    local.attachLocalData(expectedRecordsRevision, expectedPersonalRevision) {
      val next = copy(); next.put("localDataAccountId", account).put("localDataRealm", endpoint()).put("vaultMetadata", JSONObject()).put("sentHashes", JSONObject()).put("applied", JSONObject()).put("cursors", JSONObject())
      next.put("outbox", JSONArray()); save(next)
    }
    return response()
  }
  @Synchronized fun logout(): JSONObject {
    noPendingDeletion()
    ready(); val previous = state.optJSONObject("session"); val next = copy(); signedOut(next)
    if (previous != null) next.put("pendingLogout", JSONObject().put("endpoint", endpoint()).put("token", previous.getString("token")).put("expiresAt", previous.getLong("expiresAt")))
    save(next)
    retryLogout()
    return response()
  }
  private fun retryLogout() {
    val pending = state.optJSONObject("pendingLogout") ?: return
    try {
      if (pending.getLong("expiresAt") > now()) {
        try { transport(pending.getString("endpoint")).request("DELETE", "/v1/sessions/current", token = pending.getString("token")) }
        catch (error: CompanionFailure) { if (error.code != "unauthorized") throw error }
      }
      val finished = copy(); finished.remove("pendingLogout"); if (finished.optString("errorCode") == "logout-revocation-pending") finished.put("errorCode", JSONObject.NULL); save(finished)
    } catch (_: Exception) { val failed = copy(); failed.put("errorCode", "logout-revocation-pending"); save(failed) }
  }
  @Synchronized fun deleteAccount(password: String, deleteLocalData: Boolean): JSONObject {
    ready()
    if (state.optJSONObject("pendingAccountDeletion") == null) {
      val authenticated = session()
      if (!authenticated.getBoolean("deviceAuthorized")) throw CompanionFailure("not-authorized", "Confirm this device before deleting the account")
      val login = authenticated.opt("login") as? String ?: throw CompanionFailure("account-deletion-login-required", "Sign out and sign in again before deleting this account")
      val intent = JSONObject().put("version", 1).put("operationId", UUID.randomUUID().toString()).put("proof", CompanionCrypto.encode(CompanionCrypto.randomKey()))
        .put("endpoint", endpoint()).put("accountId", authenticated.getString("accountId")).put("displayName", authenticated.getString("displayName")).put("login", login)
        .put("deleteLocalData", deleteLocalData).put("expectedRecordsRevision", local.hostData().getLong("revision")).put("expectedPersonalRevision", local.personalState().getLong("revision"))
        .put("phase", "prepared").put("localDataCleared", false)
      val prepared = copy(); prepared.put("pendingAccountDeletion", intent); save(prepared)
    }
    var intent = state.getJSONObject("pendingAccountDeletion")
    if (intent.getString("phase") != "prepared") { recoverAccountDeletion(); return response() }
    if (intent.getBoolean("deleteLocalData") != deleteLocalData) throw CompanionFailure("conflict", "The saved deletion choice must be preserved until remote confirmation")
    // Probe before resubmitting: a previous response may have been lost after commit.
    try { confirmDeletionReceipt(intent) } catch (error: CompanionFailure) { if (error.code != "deletion_not_found") throw error }
    intent = state.getJSONObject("pendingAccountDeletion")
    if (intent.getString("phase") == "prepared") {
      val authenticated = transport(intent.getString("endpoint")).request("POST", "/v1/sessions", JSONObject().put("login", intent.getString("login")).put("password", password).put("deviceId", state.getString("deviceId")).put("deviceProof", state.getString("deviceProof")))
      CompanionValidation.session(authenticated)
      if (authenticated.getString("accountId") != intent.getString("accountId") || authenticated.getString("deviceId") != state.getString("deviceId") || !authenticated.getBoolean("deviceAuthorized")) throw CompanionFailure("conflict", "The deletion must use the original account and authorized device")
      transport(intent.getString("endpoint")).request("DELETE", "/v1/accounts/current", JSONObject().put("password", password).put("operationId", intent.getString("operationId")).put("proof", intent.getString("proof")), authenticated.getString("token"))
      confirmDeletionReceipt(intent)
    }
    recoverAccountDeletion()
    return response()
  }
  private fun deletionLocalDataChanged(intent: JSONObject): Boolean {
    if (!intent.getBoolean("deleteLocalData") || intent.getString("phase") == "local-complete") return false
    if (deletionKeyCleanupConflict) return true
    return try {
      val records = local.hostData().getLong("revision"); val personal = local.personalState().getLong("revision")
      if (intent.getBoolean("localDataCleared")) records != 0L || personal != 0L
      else records != intent.getLong("expectedRecordsRevision") || personal != intent.getLong("expectedPersonalRevision")
    } catch (_: Exception) { true }
  }
  private fun confirmDeletionReceipt(intent: JSONObject) {
    val receipt = transport(intent.getString("endpoint")).request("POST", "/v1/account-deletions/${intent.getString("operationId")}/receipt", JSONObject().put("proof", intent.getString("proof")))
    CompanionValidation.deletionReceipt(receipt, intent.getString("operationId"), intent.getString("accountId"))
    val next = copy(); next.getJSONObject("pendingAccountDeletion").put("phase", "confirmed"); signedOut(next)
    next.getJSONObject("accountKeys").remove(intent.getString("endpoint") + "#" + intent.getString("accountId"))
    if (next.optString("localDataRealm") == intent.getString("endpoint") && next.optString("localDataAccountId") == intent.getString("accountId")) next.put("localDataAccountId", JSONObject.NULL).put("localDataRealm", JSONObject.NULL).put("vaultMetadata", JSONObject()).put("sentHashes", JSONObject())
    save(next)
  }
  private fun recoverAccountDeletion() {
    var intent = state.getJSONObject("pendingAccountDeletion")
    if (intent.getString("phase") == "prepared") confirmDeletionReceipt(intent)
    intent = state.getJSONObject("pendingAccountDeletion")
    if (intent.getString("phase") == "confirmed") {
      if (intent.getBoolean("deleteLocalData")) {
        if (!intent.getBoolean("localDataCleared")) {
          if (deletionLocalDataChanged(intent)) throw CompanionFailure("conflict", "Local data changed; confirm the current data or keep it")
          val committed = copy(); committed.getJSONObject("pendingAccountDeletion").put("localDataCleared", true)
          val metadata = store.prepare(committed) { state = committed }
          runDeletionLocalCleanup { local.deleteAccountLocalData(intent.getLong("expectedRecordsRevision"), intent.getLong("expectedPersonalRevision"), metadata) }
        }
        runDeletionLocalCleanup { local.finishAccountDeletionKeyCleanup() }
      }
      val completed = copy(); completed.getJSONObject("pendingAccountDeletion").put("phase", "local-complete"); completed.put("errorCode", JSONObject.NULL); save(completed)
    }
    intent = state.getJSONObject("pendingAccountDeletion")
    if (intent.getString("phase") == "local-complete") {
      try {
        val acknowledged = transport(intent.getString("endpoint")).request("POST", "/v1/account-deletions/${intent.getString("operationId")}/ack", JSONObject().put("proof", intent.getString("proof")))
        CompanionValidation.deletionAcknowledgement(acknowledged, intent.getString("operationId"))
      } catch (error: CompanionFailure) { if (error.code != "deletion_not_found") throw error }
      val finished = copy(); finished.put("pendingAccountDeletion", JSONObject.NULL).put("errorCode", JSONObject.NULL); save(finished); deletionKeyCleanupConflict = false
    }
  }
  private fun runDeletionLocalCleanup(action: () -> Unit) {
    try { action() } catch (error: com.zzzode.leanon.personal.PersonalFailure) {
      if (error.code == "conflict" && state.optJSONObject("pendingAccountDeletion")?.optBoolean("localDataCleared") == true) {
        deletionKeyCleanupConflict = true
        throw CompanionFailure("account-deletion-key-cleanup-conflict", "New local files must be preserved; choose to keep local data")
      }
      throw CompanionFailure(error.code, error.message ?: "Local deletion cleanup failed")
    }
  }
  @Synchronized fun confirmAccountDeletionLocalData(deleteLocalData: Boolean, expectedRecordsRevision: Long, expectedPersonalRevision: Long): JSONObject {
    ready(); val intent = state.optJSONObject("pendingAccountDeletion") ?: throw CompanionFailure("conflict", "No deletion is pending")
    if (intent.getString("phase") != "confirmed") throw CompanionFailure("conflict", "Remote deletion must be confirmed first")
    if (local.hostData().getLong("revision") != expectedRecordsRevision || local.personalState().getLong("revision") != expectedPersonalRevision) throw CompanionFailure("conflict", "Local data changed again")
    if (deleteLocalData && intent.getBoolean("localDataCleared") && deletionLocalDataChanged(intent)) throw CompanionFailure("conflict", "The original data was already cleared; newer data must be preserved")
    val next = copy(); next.getJSONObject("pendingAccountDeletion").put("deleteLocalData", deleteLocalData).put("expectedRecordsRevision", expectedRecordsRevision).put("expectedPersonalRevision", expectedPersonalRevision)
    local.attachLocalData(expectedRecordsRevision, expectedPersonalRevision) { save(next) }
    recoverAccountDeletion(); return response()
  }
  @Synchronized fun createInvitation(kind: String): JSONObject {
    refresh(); if (kind !in listOf("family", "device")) throw CompanionFailure("invalid-request", "Invalid invitation kind")
    if (!session().getBoolean("deviceAuthorized")) throw CompanionFailure("not-authorized", "Confirm this device first")
    val recoverable = rows(state.getJSONArray("invitations")).firstOrNull { it.getString("kind") == kind && it.getString("creatorId") == accountId() && it.getString("creatorDeviceId") == state.getString("deviceId") && it.getString("status") in listOf("open", "pending") && it.getLong("expiresAt") > now() }
    if (recoverable != null) {
      val saved = state.getJSONObject("invitationSecrets").optJSONObject(recoverable.getString("id")) ?: throw CompanionFailure("conflict", "Cancel the previous invitation before creating another")
      val secret = CompanionCrypto.decode(saved.opt("secret"), 32)
      return try { response().put("invitationCode", CompanionCrypto.invitationCode(recoverable.getString("id"), secret)) } finally { secret.fill(0) }
    }
    if (kind == "device") {
      val vault = JSONObject().put("id", session().getString("vaultId")).put("kind", "vault").put("epoch", session().optLong("vaultEpoch", 1))
      pullMissingFamilyKey(vault); queueKeyring(vault); syncGroup(vault, true)
    }
    val id = UUID.randomUUID().toString(); val secret = CompanionCrypto.randomKey()
    val groupKey = if (kind == "device") CompanionCrypto.decode(state.getJSONObject("accountKeys").opt(accountKey()), 32) else CompanionCrypto.randomKey()
    try {
      val initial = copy(); initial.getJSONObject("invitationSecrets").put(id, JSONObject().put("secret", CompanionCrypto.encode(secret)).put("key", CompanionCrypto.encode(groupKey)))
      save(initial)
      val proof = CompanionCrypto.inviteProof(secret, id); val wrap = CompanionCrypto.inviteWrapKey(secret, id)
      val invite = try { request("POST", "/v1/invites", JSONObject().put("id", id).put("kind", kind).put("proofHash", CompanionCrypto.hash(proof)).put("wrappedKey", CompanionCrypto.seal(wrap, groupKey, id.toByteArray())).put("expiresInSeconds", 600)) } finally { proof.fill(0); wrap.fill(0) }
      val next = copy(); next.getJSONObject("groupKeys").put(invite.getString("groupId"), CompanionCrypto.encode(groupKey)); next.getJSONArray("invitations").put(invite); save(next)
      return response().put("invitationCode", CompanionCrypto.invitationCode(id, secret))
    } finally { secret.fill(0); groupKey.fill(0) }
  }
  @Synchronized fun acceptInvitation(code: String): JSONObject {
    val (id, secret) = CompanionCrypto.parseInvitationCode(code)
    try {
      val initial = copy(); initial.getJSONObject("invitationSecrets").put(id, JSONObject().put("secret", CompanionCrypto.encode(secret))); save(initial)
      val proof = CompanionCrypto.inviteProof(secret, id)
      val invite = try { request("POST", "/v1/invites/$id/accept", JSONObject().put("proof", CompanionCrypto.encode(proof))) } finally { proof.fill(0) }
      val next = copy(); installInviteKey(next, invite); next.getJSONArray("invitations").put(invite); save(next); refresh(); return response()
    } finally { secret.fill(0) }
  }
  private fun installInviteKey(next: JSONObject, invite: JSONObject) {
    val secret = next.getJSONObject("invitationSecrets").optJSONObject(invite.getString("id"))?.opt("secret") ?: return
    val bytes = CompanionCrypto.decode(secret, 32); val wrap = CompanionCrypto.inviteWrapKey(bytes, invite.getString("id"))
    try {
      val groupKey = CompanionCrypto.open(wrap, invite.getJSONObject("wrappedKey"), invite.getString("id").toByteArray())
      try { if (groupKey.size != 32) throw IOException("Invalid invited key"); next.getJSONObject("groupKeys").put(invite.getString("groupId"), CompanionCrypto.encode(groupKey)); if (invite.getString("kind") == "device") next.getJSONObject("accountKeys").put(accountKey(), CompanionCrypto.encode(groupKey)) } finally { groupKey.fill(0) }
    } finally { bytes.fill(0); wrap.fill(0) }
  }
  @Synchronized fun confirmInvitation(id: String): JSONObject { validId(id); request("POST", "/v1/invites/$id/confirm", JSONObject()); refresh(); return response() }
  @Synchronized fun cancelInvitation(id: String): JSONObject { validId(id); request("DELETE", "/v1/invites/$id"); val next = copy(); next.getJSONObject("invitationSecrets").remove(id); save(next); refresh(); return response() }
  private fun validId(value: String) { if (!value.matches(Regex("[A-Za-z0-9_-]{1,128}"))) throw CompanionFailure("invalid-request", "Invalid identity") }
  private fun refresh() {
    val dto = request("GET", "/v1/me"); dto.optJSONObject("family")?.let(CompanionValidation::group); val next = copy(); next.getJSONObject("session").put("deviceAuthorized", dto.getBoolean("deviceAuthorized"))
    wireProtocol = if (dto.has("protocol")) CompanionValidation.integer(dto.opt("protocol")).toInt().also { if (it != 2) throw IOException("Unsupported relay protocol") } else 1
    dto.optJSONObject("vault")?.let { CompanionValidation.group(it); if (it.getString("id") != session().getString("vaultId")) throw IOException("Vault identity mismatch"); next.getJSONObject("session").put("vaultEpoch", it.getLong("epoch")) }
    next.put("invitations", dto.getJSONArray("invites"))
    for (invite in rows(dto.getJSONArray("invites"))) if (invite.optString("status") in listOf("pending", "accepted")) installInviteKey(next, invite)
    val group = dto.optJSONObject("family")
    if (group == null) { if (next.optJSONObject("family") != null) { rememberRevoked(next, next.getJSONObject("family").getString("id")); clearPeer(next) } }
    else applyGrants(next, group)
    save(next)
  }
  @Synchronized fun refreshState(): JSONObject { refresh(); return response() }
  private fun rememberRevoked(next: JSONObject, id: String) {
    val ledger = next.optJSONObject("revokedFamilies") ?: JSONObject().also { next.put("revokedFamilies", it) }
    ledger.put(accountKey() + "#" + id, true)
  }
  private fun applyGrants(next: JSONObject, group: JSONObject) {
    if (next.optJSONObject("revokedFamilies")?.optBoolean(accountKey() + "#" + group.getString("id")) == true) throw CompanionFailure("not-authorized", "Previously revoked family cannot be restored")
    val old = next.optJSONObject("family"); if (old != null && old.getString("id") != group.getString("id")) { rememberRevoked(next, old.getString("id")); clearPeer(next); next.put("outbox", JSONArray(rows(next.getJSONArray("outbox")).filter { it.getString("groupId") == session().getString("vaultId") })) }
    val copy = JSONObject(group.toString()).put("observedAt", if (old?.optString("id") == group.getString("id")) old.getString("observedAt") else iso())
    next.put("family", copy)
    val peer = peerId(group); val allowed = grants(group, peer, accountId()); val data = next.getJSONObject("peerData")
    for (category in data.keys().asSequence().toList()) if (category !in allowed) data.remove(category)
    if ("photos" !in allowed) { if (next.getJSONObject("peerPhotos").length() > 0) next.put("pendingPeerPreviewCleanup", true); next.put("peerPhotos", JSONObject()) }
    val ownAllowed = outgoing(group, next)
    next.put("outbox", JSONArray(rows(next.getJSONArray("outbox")).filter { entry ->
      entry.getString("groupId") != group.getString("id") || (entry.getJSONObject("change").getString("category") in ownAllowed && (entry.getJSONObject("change").getString("kind") != "encouragement" || "encouragement" in allowed))
    }))
    if ("encouragement" !in allowed || "encouragement" !in grants(group, accountId(), peer)) {
      next.put("messages", JSONArray()); next.getJSONObject("pendingAcks").remove(group.getString("id"))
    } else if ("encouragement" !in outgoing(group, next)) {
      next.put("messages", JSONArray(rows(next.getJSONArray("messages")).filter { it.getString("direction") == "outgoing" }))
      next.getJSONObject("pendingAcks").remove(group.getString("id"))
    }
  }
  @Synchronized fun setSharing(categories: List<String>): JSONObject {
    if (categories.toSet().size != categories.size || categories.any { it !in CATEGORIES }) throw CompanionFailure("invalid-request", "Invalid sharing categories")
    session(); val group = state.optJSONObject("family") ?: throw CompanionFailure("not-authorized", "Pair a partner first")
    val consent = copy(); consent.getJSONObject("localConsent").put(consentKey(group), JSONArray(categories))
    consent.put("outbox", JSONArray(rows(consent.getJSONArray("outbox")).filter { it.getString("groupId") != group.getString("id") || it.getJSONObject("change").getString("category") in categories }))
    if ("encouragement" !in categories) { consent.put("messages", JSONArray()); consent.getJSONObject("pendingAcks").remove(group.getString("id")) }
    save(consent)
    refresh()
    val current = state.optJSONObject("family") ?: throw CompanionFailure("not-authorized", "Pair a partner first")
    if (current.getString("id") != group.getString("id")) throw CompanionFailure("conflict", "Partner binding changed")
    val dto = request("PUT", "/v1/groups/${group.getString("id")}/grants", JSONObject().put("epoch", group.getLong("epoch")).put("recipientId", peerId(group)).put("categories", JSONArray(categories)))
    val next = copy(); applyGrants(next, dto)
    val retained = rows(next.getJSONArray("outbox")).filter { it.getString("groupId") != group.getString("id") || it.getJSONObject("change").getString("category") in categories }
    next.put("outbox", JSONArray(retained)); for (id in next.getJSONObject("sentHashes").keys().asSequence().toList()) if (id.startsWith(group.getString("id") + ":")) next.getJSONObject("sentHashes").remove(id); save(next); return response()
  }
  private fun queue(group: JSONObject, recordId: String, category: String, plain: JSONObject, kind: String = "record", deleted: Boolean = false): JSONObject {
    val id = UUID.randomUUID().toString(); val timestamp = maxOf(now(), state.optLong("lastChangeTimestamp", 0) + 1); if (timestamp > 9007199254740991L) throw IOException("Sync clock limit reached"); val change = JSONObject().put("id", id).put("recordId", recordId).put("category", category).put("kind", kind).put("updatedAt", timestamp).put("deleted", deleted)
    val key = key(group)
    try {
      val prepared = if (wireProtocol == 2) CompanionPhotoProtocol.prepare(plain, key, group.getString("id"), group.getLong("epoch"), accountId(), state.getString("deviceId")) else CompanionPhotoProtocol.Prepared(plain, JSONArray(), JSONArray())
      if (prepared.references.length() > 0) change.put("objects", prepared.references).put("_photoPackets", prepared.packets)
      val bytes = prepared.plain.toString().toByteArray(Charsets.UTF_8)
      try { if (bytes.size > (if (wireProtocol == 2) 128 * 1024 else 64 * 1024 * 1024)) throw CompanionFailure("capacity", "Sync payload exceeds relay capacity"); change.put("payload", CompanionCrypto.seal(key, bytes, CompanionCrypto.aad(group.getString("id"), group.getLong("epoch"), accountId(), state.getString("deviceId"), change))) } finally { bytes.fill(0) }
    } finally { key.fill(0) }
    val next = copy(); next.put("lastChangeTimestamp", timestamp); next.getJSONArray("outbox").put(JSONObject().put("groupId", group.getString("id")).put("epoch", group.getLong("epoch")).put("change", change)); save(next); return change
  }
  @Synchronized fun sendEncouragement(text: String): JSONObject {
    val message = text.trim(); if (message.isEmpty() || message.length > 2000) throw CompanionFailure("invalid-request", "Invalid encouragement")
    refresh(); val group = state.optJSONObject("family") ?: throw CompanionFailure("not-authorized", "Pair a partner first")
    val peer = peerId(group); if ("encouragement" !in outgoing(group) || "encouragement" !in grants(group, peer, accountId())) throw CompanionFailure("not-authorized", "Both people must opt in to encouragement")
    if (state.getJSONArray("messages").length() >= 1000) throw CompanionFailure("conflict", "Message history limit reached")
    val createdAt = iso(); val change = queue(group, UUID.randomUUID().toString(), "encouragement", JSONObject().put("version", 1).put("kind", "encouragement").put("text", message).put("createdAt", createdAt), "encouragement")
    val next = copy(); next.getJSONArray("messages").put(JSONObject().put("id", change.getString("id")).put("text", message).put("createdAt", createdAt).put("direction", "outgoing").put("status", "pending")); save(next)
    syncGroup(group, false); return response()
  }
  @Synchronized fun unlink(): JSONObject {
    refresh(); val group = state.optJSONObject("family") ?: throw CompanionFailure("not-authorized", "No paired partner")
    request("DELETE", "/v1/groups/${group.getString("id")}", JSONObject().put("epoch", group.getLong("epoch")))
    val next = copy(); rememberRevoked(next, group.getString("id")); clearPeer(next); next.put("invitations", JSONArray()).put("invitationSecrets", JSONObject())
    next.put("outbox", JSONArray(rows(next.getJSONArray("outbox")).filter { it.getString("groupId") != group.getString("id") })); save(next)
    if (session().getBoolean("deviceAuthorized") && state.getJSONObject("accountKeys").has(accountKey())) {
      val vault = JSONObject().put("id", session().getString("vaultId")).put("kind", "vault").put("epoch", session().optLong("vaultEpoch", 1))
      queueIfChanged(vault, "keyring-" + state.getString("deviceId"), "vault-keyring", JSONObject().put("version", 1).put("kind", "account-keyring").put("familyKeys", JSONObject()))
      syncGroup(vault, true)
    }
    return response()
  }
  @Synchronized fun sync(): JSONObject {
    refresh(); if (!session().getBoolean("deviceAuthorized")) throw CompanionFailure("not-authorized", "Confirm this device first")
    val ownGroup = JSONObject().put("id", session().getString("vaultId")).put("kind", "vault").put("epoch", session().optLong("vaultEpoch", 1))
    pullMissingFamilyKey(ownGroup); queueKeyring(ownGroup)
    if (ownAttached()) {
      val payload = local.exportVaultPayload(); val envelope = CompanionVaultMerge.prepare(payload, state.getJSONObject("vaultMetadata").optJSONObject(accountKey()), state.getString("deviceId"), now())
      queueIfChanged(ownGroup, "vault-snapshot-" + state.getString("deviceId"), "vault", envelope)
    }
    if (state.getJSONObject("accountKeys").has(accountKey())) syncGroup(ownGroup, true)
    if (ownAttached()) state.optJSONObject("family")?.let { publishCategories(it, local.exportVaultPayload()) }
    state.optJSONObject("family")?.let { syncGroup(it, false) }
    val next = copy(); next.put("lastSyncAt", iso()).put("errorCode", JSONObject.NULL); save(next)
    return response().put("hostData", local.hostData()).put("personal", local.personalState())
  }
  private fun pullMissingFamilyKey(vault: JSONObject) {
    val family = state.optJSONObject("family") ?: return
    if (!state.getJSONObject("groupKeys").has(family.getString("id")) && state.getJSONObject("accountKeys").has(accountKey())) syncGroup(vault, true)
  }
  private fun queueKeyring(group: JSONObject) {
    val active = state.optJSONObject("family")
    if (active != null && !state.getJSONObject("groupKeys").has(active.getString("id"))) throw CompanionFailure("unavailable", "Active family key is unavailable; saved keyring preserved")
    val familyKeys = JSONObject(); state.optJSONObject("family")?.let { family -> state.getJSONObject("groupKeys").optString(family.getString("id")).takeIf { it.isNotEmpty() }?.let { familyKeys.put(family.getString("id"), it) } }
    if (state.getJSONObject("accountKeys").has(accountKey())) queueIfChanged(group, "keyring-" + state.getString("deviceId"), "vault-keyring", JSONObject().put("version", 1).put("kind", "account-keyring").put("familyKeys", familyKeys))
  }
  private fun queueIfChanged(group: JSONObject, recordId: String, category: String, plain: JSONObject, deleted: Boolean = false) {
    val normalized = JSONObject(plain.toString()); normalized.optJSONObject("payload")?.remove("createdAt")
    val digest = CompanionCrypto.hash((CompanionVaultMerge.canonical(normalized) + ":" + deleted).toByteArray()); val key = group.getString("id") + ":" + recordId
    if (state.getJSONObject("sentHashes").optString(key) == digest) return
    queue(group, recordId, category, plain, deleted = deleted)
    val next = copy(); next.getJSONObject("sentHashes").put(key, digest)
    if (group.getString("kind") == "vault" && category == "vault") next.getJSONObject("vaultMetadata").put(accountKey(), CompanionVaultMerge.metadata(plain))
    save(next)
  }
  private fun publishCategories(group: JSONObject, payload: JSONObject) {
    val allowed = outgoing(group); val records = payload.getJSONObject("records"); val personal = payload.getJSONObject("personal")
    for (category in allowed.filter { it != "encouragement" }) {
      val data: Any = when (category) {
        "goal" -> JSONObject().put("guidanceMode", records.getString("guidanceMode")).apply { if (!records.isNull("weeklyLossKg")) put("weeklyLossKg", records.getDouble("weeklyLossKg")) }
        "progress_band" -> { val weights = rows(records.getJSONArray("weights")); if (weights.size < 2) "insufficient-data" else if (weights.map { it.getDouble("weightKg") }.distinct().size == 1) "maintaining" else "changing" }
        "checkin_streak" -> { val dates = listOf("weights", "water", "exercises", "intakeEntries").flatMap { rows(records.getJSONArray(it)).map { row -> row.getString("date") } }.toSet(); var day = LocalDate.ofInstant(Instant.ofEpochMilli(now()), ZoneId.systemDefault()); var streak = 0; while (day.toString() in dates) { streak++; day = day.minusDays(1) }; streak }
        "exact_weight" -> rows(records.getJSONArray("weights")).maxByOrNull { it.getString("date") }?.getDouble("weightKg") ?: JSONObject.NULL
        "meals" -> JSONArray(rows(records.getJSONArray("intakeEntries")).sortedByDescending { it.getString("date") }.take(1000).map { JSONObject().put("date", it.getString("date")).put("name", it.getString("name")).put("kcal", it.getDouble("kcal")) })
        "photos" -> personal.getJSONArray("photos")
        "body_measurements" -> personal.getJSONArray("measurements")
        "menstrual" -> JSONArray() // No menstrual records exist in the native schema; do not invent them.
        else -> throw CompanionFailure("invalid-request", "Invalid category")
      }
      val plain = JSONObject().put("version", 1).put("kind", "family-category").put("category", category).put("data", data)
      if (category == "photos") plain.put("photoBytes", payload.getJSONArray("photos"))
      queueIfChanged(group, "category-$category", category, plain, deleted = data === JSONObject.NULL)
    }
  }
  private fun syncGroup(initial: JSONObject, vault: Boolean) {
    var group = initial; var pages = 0
    while (pages++ < 100) {
      val groupId = group.getString("id"); val cursor = state.getJSONObject("cursors").optLong(groupId, 0)
      val queued = rows(state.getJSONArray("outbox")).filter { it.getString("groupId") == groupId }
      val selected = mutableListOf<JSONObject>(); var batchBytes = 2048L
      for (entry in queued) { val size = CompanionPhotoProtocol.wire(entry.getJSONObject("change")).toString().toByteArray(Charsets.UTF_8).size.toLong(); if (selected.size >= (if (wireProtocol == 2) 4 else 100) || batchBytes + size > (if (wireProtocol == 2) 512L * 1024 else 95L * 1024 * 1024)) break; selected.add(entry); batchBytes += size }
      if (queued.isNotEmpty() && selected.isEmpty()) throw CompanionFailure("capacity", "Sync batch exceeds supported size")
      val pendingAcks = state.getJSONObject("pendingAcks").optJSONArray(groupId) ?: JSONArray()
      val sentAcks = strings(pendingAcks).take(if (wireProtocol == 2) 4 else 100)
      if (wireProtocol == 2) for (entry in selected) uploadPhotos(group, entry.getJSONObject("change"))
      val dto = request("POST", "/v1/groups/$groupId/sync", JSONObject().put("epoch", group.getLong("epoch")).put("cursor", cursor)
        .put("changes", JSONArray(selected.map { CompanionPhotoProtocol.wire(it.getJSONObject("change")) })).put("acks", JSONArray(sentAcks)))
      val remoteGroup = dto.getJSONObject("group"); CompanionValidation.group(remoteGroup); if (CompanionValidation.integer(dto.opt("cursor")) < cursor) throw IOException("Relay cursor moved backwards"); CompanionValidation.integer(dto.opt("epoch")); if (dto.getJSONArray("changes").length() > 100) throw IOException("Relay batch exceeds supported size"); if (remoteGroup.getLong("epoch") != group.getLong("epoch") || remoteGroup.getString("id") != groupId) throw IOException("Unexpected sync group")
      if (remoteGroup.getString("kind") != (if (vault) "vault" else "family")) throw IOException("Unexpected sync group kind")
      if (accountId() !in strings(remoteGroup.getJSONArray("members"))) throw IOException("Unexpected sync group membership")
      if (dto.getLong("epoch") != group.getLong("epoch")) throw IOException("Unexpected sync epoch")
      val next = copy(); if (!vault) applyGrants(next, remoteGroup)
      val applied = next.getJSONObject("applied").optJSONArray(groupId)?.let(::strings)?.toMutableSet() ?: mutableSetOf()
      val newAcks = linkedSetOf<String>().also { it.addAll(strings(pendingAcks).drop(sentAcks.size)) }
      val baseline = if (vault && ownAttached()) local.exportVaultPayload() else null
      var merged: JSONObject? = if (baseline != null) CompanionVaultMerge.prepare(baseline, next.getJSONObject("vaultMetadata").optJSONObject(accountKey()), state.getString("deviceId"), now()) else null
      var previousSequence = cursor
      for (change in rows(dto.getJSONArray("changes"))) {
        val sequence = CompanionValidation.integer(change.opt("sequence")); if (sequence <= previousSequence || sequence > dto.getLong("cursor")) throw IOException("Invalid relay sequence"); previousSequence = sequence; val id = change.getString("id"); next.put("lastChangeTimestamp", maxOf(next.optLong("lastChangeTimestamp", 0), CompanionValidation.integer(change.opt("updatedAt")))); if (id in applied) continue
        val owner = change.getString("ownerId"); if (owner !in strings(remoteGroup.getJSONArray("members"))) throw IOException("Unexpected change owner"); if (vault && owner != accountId()) throw IOException("Unexpected vault owner")
        if (!vault && owner != accountId() && change.getString("category") !in grants(remoteGroup, owner, accountId())) continue
        if (vault && change.getString("category") != "vault-keyring" && !ownAttached()) continue
        val bytesKey = key(group); val bytes = try { CompanionCrypto.open(bytesKey, change.getJSONObject("payload"), CompanionCrypto.aad(groupId, group.getLong("epoch"), owner, change.getString("deviceId"), change)) } finally { bytesKey.fill(0) }
        try {
          val decrypted = com.zzzode.leanon.personal.strictJsonObject(String(bytes, Charsets.UTF_8))
          val photoKey = key(group)
          val plain = try { CompanionPhotoProtocol.hydrate(decrypted, change, photoKey, groupId, group.getLong("epoch"), owner, change.getString("deviceId")) { objectId -> transport(endpoint()).binary("GET", "/v2/groups/$groupId/objects/$objectId", null, session().getString("token")) } } finally { photoKey.fill(0) }
          if (vault && change.getString("category") == "vault-keyring") {
            if (plain.length() != 3 || plain.opt("version") !is Number || plain.getDouble("version") != 1.0 || plain.opt("kind") != "account-keyring") throw IOException("Invalid account keyring")
            val incomingKeys = plain.getJSONObject("familyKeys"); if (incomingKeys.length() > 1) throw IOException("Invalid account keyring")
            for (incomingId in incomingKeys.keys()) { validId(incomingId); CompanionCrypto.decode(incomingKeys.opt(incomingId), 32).fill(0) }
            next.optJSONObject("family")?.let { family -> incomingKeys.opt(family.getString("id"))?.let { encoded -> val familyKey = CompanionCrypto.decode(encoded, 32); try { next.getJSONObject("groupKeys").put(family.getString("id"), CompanionCrypto.encode(familyKey)) } finally { familyKey.fill(0) } } }
          } else if (vault) {
            if (!ownAttached()) throw CompanionFailure("not-authorized", "Explicitly attach local data before importing")
            merged = CompanionVaultMerge.merge(merged!!, plain)
          } else if (owner != accountId() || change.getString("kind") == "encouragement") {
            if (change.getString("kind") == "encouragement") {
              if (change.getBoolean("deleted")) throw IOException("Deleted encouragement cannot be acknowledged")
              if (plain.length() != 4 || plain.opt("version") !is Number || plain.getDouble("version") != 1.0 || plain.getString("kind") != "encouragement" || change.getString("category") != "encouragement") throw IOException("Invalid encouragement")
              if (owner != accountId() && "encouragement" !in outgoing(remoteGroup, next)) continue
              val text = plain.getString("text"); Instant.parse(plain.getString("createdAt")); if (text.trim().isEmpty() || text.length > 2000) throw IOException("Invalid encouragement")
              val messages = next.getJSONArray("messages"); if (rows(messages).none { it.getString("id") == id }) { if (messages.length() >= 1000) throw CompanionFailure("capacity", "Message history limit reached"); messages.put(JSONObject().put("id", id).put("text", text).put("createdAt", plain.getString("createdAt")).put("direction", if (owner == accountId()) "outgoing" else "incoming").put("status", "pending")) }
              if (owner != accountId()) newAcks.add(id)
            } else {
              if (plain.opt("version") !is Number || plain.getDouble("version") != 1.0 || plain.length() != (if (change.getString("category") == "photos") 5 else 4) || plain.getString("kind") != "family-category" || plain.getString("category") != change.getString("category")) throw IOException("Invalid shared category")
              val category = plain.getString("category"); if (!change.getBoolean("deleted")) CompanionValidation.category(category, plain.get("data")); if (!change.getBoolean("deleted")) next.getJSONObject("peerData").put(category, JSONObject().put("data", plain.get("data")).put("updatedAt", iso(change.getLong("updatedAt")))) else next.getJSONObject("peerData").remove(category)
              if (category == "photos" && change.getBoolean("deleted")) next.put("peerPhotos", JSONObject())
              if (category == "photos" && !change.getBoolean("deleted")) {
                val metadata = plain.getJSONArray("data"); val blobs = plain.getJSONArray("photoBytes"); val byId = rows(blobs).associateBy { it.getString("id") }
                if (byId.size != metadata.length()) throw IOException("Missing shared photo bytes")
                val photos = JSONObject()
                for (photo in rows(metadata)) { val blob = byId[photo.getString("id")] ?: throw IOException("Missing shared photo bytes"); val image = CompanionCrypto.decode(blob.opt("bytesBase64")); try { com.zzzode.leanon.personal.validateDecodedSanitizedJpeg(image, photo.getInt("width"), photo.getInt("height")); photos.put(photo.getString("id"), JSONObject().put("metadata", photo).put("bytesBase64", CompanionCrypto.encode(image))) } finally { image.fill(0) } }
                next.put("peerPhotos", photos)
              }
            }
          }
          applied.add(id)
        } finally { bytes.fill(0) }
      }
      val sent = selected.map { it.getJSONObject("change").getString("id") }.toSet()
      next.put("outbox", JSONArray(rows(next.getJSONArray("outbox")).filter { it.getJSONObject("change").getString("id") !in sent }))
      next.getJSONObject("cursors").put(groupId, dto.getLong("cursor")); next.getJSONObject("applied").put(groupId, JSONArray(applied.sorted()))
      next.getJSONObject("pendingAcks").put(groupId, JSONArray(newAcks.toList()))
      val receipts = dto.getJSONArray("receipts"); if (receipts.length() > 1000 || (vault && receipts.length() != 0)) throw IOException("Invalid relay receipts")
      for (receipt in rows(receipts)) {
        if (receipt.length() != 3) throw IOException("Invalid relay receipt")
        validId(receipt.getString("id")); val acknowledged = CompanionValidation.integer(receipt.opt("acknowledgedAt")); val recipient = receipt.getString("recipientId"); validId(recipient)
        val message = rows(next.getJSONArray("messages")).singleOrNull { it.getString("id") == receipt.getString("id") } ?: continue
        val expectedRecipient = if (message.getString("direction") == "outgoing") peerId(remoteGroup) else accountId()
        if (recipient != expectedRecipient) throw IOException("Unexpected receipt recipient")
        message.put("status", "delivered").put("deliveredAt", iso(acknowledged))
      }
      if (vault && merged != null) {
        next.getJSONObject("vaultMetadata").put(accountKey(), CompanionVaultMerge.metadata(merged))
        val pending = store.prepare(next) { state = next }
        local.mergeVaultPayload(merged.getJSONObject("payload"), pending, baseline!!.getJSONObject("records").getLong("revision"), baseline.getJSONObject("personal").getLong("revision"))
        cleanupPeerPreviews()
      } else save(next)
      group = remoteGroup
      // Persistence above precedes ACK in the next real HTTP request.
      if (dto.getLong("cursor") == cursor && newAcks.isEmpty() && state.getJSONArray("outbox").length() == 0) break
      if (dto.getJSONArray("changes").length() == 0 && newAcks.isEmpty() && queued.isEmpty()) break
    }
    if (pages > 100) throw CompanionFailure("unavailable", "Sync paging limit reached")
  }
  private fun uploadPhotos(group: JSONObject, change: JSONObject) {
    val packets = change.optJSONArray("_photoPackets") ?: return
    val refs = rows(change.getJSONArray("objects")); val groupId = group.getString("id")
    for (batch in refs.chunked(4)) request("POST", "/v2/groups/$groupId/objects/reserve", JSONObject().put("epoch", group.getLong("epoch")).put("objects", JSONArray(batch)))
    for (packet in rows(packets)) {
      val bytes = CompanionCrypto.decode(packet.getString("bytesBase64")); val objectId = packet.getString("id")
      try { val ref = refs.singleOrNull { it.getString("id") == objectId } ?: throw IOException("Invalid saved photo packet"); if (bytes.size.toLong() != ref.getLong("size") || CompanionCrypto.hash(bytes) != ref.getString("digest")) throw IOException("Invalid saved photo digest"); val response = JSONObject(String(transport(endpoint()).binary("PUT", "/v2/groups/$groupId/objects/$objectId", bytes, session().getString("token")), Charsets.UTF_8)); if (response.opt("ok") != true || response.optString("id") != objectId) throw IOException("Invalid photo upload receipt") } finally { bytes.fill(0) }
    }
  }
  private fun peerSnapshot(next: JSONObject): JSONObject {
    val data = next.getJSONObject("peerData"); val family = next.optJSONObject("family"); val categories = if (family == null) emptyList() else grants(family, peerId(family), accountId()).sorted(); val snapshot = JSONObject().put("sharedCategories", JSONArray(categories))
    val latest = categories.mapNotNull { data.optJSONObject(it)?.getString("updatedAt") }.maxOrNull() ?: iso(); snapshot.put("updatedAt", latest)
    val fields = mapOf("goal" to "goal", "progress_band" to "progressBand", "checkin_streak" to "checkinStreak", "exact_weight" to "exactWeightKg", "meals" to "meals", "photos" to "photos", "body_measurements" to "measurements", "menstrual" to "menstrual")
    for ((category, field) in fields) data.optJSONObject(category)?.let { snapshot.put(field, it.get("data")) }
    return snapshot
  }
  @Synchronized fun getPeerPhoto(id: String): Pair<JSONObject, ByteArray> {
    validId(id); session(); refresh(); val group = state.optJSONObject("family") ?: throw CompanionFailure("not-authorized", "No paired partner")
    if ("photos" !in grants(group, peerId(group), accountId())) throw CompanionFailure("not-authorized", "Partner has not shared photos")
    val photo = state.getJSONObject("peerPhotos").optJSONObject(id) ?: throw CompanionFailure("not-found", "Partner photo is unavailable")
    return JSONObject(photo.getJSONObject("metadata").toString()) to CompanionCrypto.decode(photo.opt("bytesBase64"))
  }
  @Synchronized fun recordFailure(code: String) { val next = copy(); next.put("errorCode", code); save(next) }
  companion object { val CATEGORIES = listOf("goal", "progress_band", "checkin_streak", "meals", "photos", "menstrual", "exact_weight", "body_measurements", "encouragement") }
}
