import Foundation
import CryptoKit

/// Serial native service: authenticated HTTP, secure credentials, E2EE and durable receipts.
/// UI gets only the credential-free projection; no local record is attached by logging in.
final class CompanionService {
  static let categories = ["goal", "progress_band", "checkin_streak", "meals", "photos", "menstrual", "exact_weight", "body_measurements", "encouragement"]
  let storage: CompanionStateFile
  private let http: CompanionHTTPTransport
  private let data: CompanionDataAdapter
  private let now: () -> Date
  private var syncState = "idle"
  private var errorCode: String?
  private var wireProtocol = 1
  init(storage: CompanionStateFile, http: CompanionHTTPTransport = CompanionHTTP(), data: CompanionDataAdapter,
       now: @escaping () -> Date = Date.init) { self.storage = storage; self.http = http; self.data = data; self.now = now }

  func execute(_ action: String, params: [String: Any] = [:]) throws -> NSDictionary {
    storage.lock.lock(); defer { storage.lock.unlock() }
    var state = try storage.load()
    let deletionActions = ["getState", "deleteAccount", "confirmAccountDeletionLocalData"]
    if state["pendingAccountDeletion"] is [String: Any], !deletionActions.contains(action) { throw CompanionError.accountDeletionPending }
    if state["pendingAccountDeletion"] is NSNull {
      if action != "getState", state["pendingLocalDeletion"] as? Bool == true { throw CompanionError.persistence }
      if action != "getState", state["pendingPreviewClear"] is String { throw CompanionError.previewCleanupPending }
    }
    do {
      var additions: [String: Any] = [:]
      switch action {
      case "getState":
        if state["pendingAccountDeletion"] is [String: Any] {
          do { try recoverAccountDeletion(&state) }
          catch {
            state = (try? storage.load()) ?? state
            syncState = (error as? CompanionError)?.code == "offline" ? "offline" : "error"
            errorCode = (error as? CompanionError)?.code ?? "unavailable"
          }
          return projection(state) as NSDictionary
        }
        if state["pendingLocalDeletion"] as? Bool == true {
          do { try finishLocalDeletion(&state) }
          catch { syncState = "error"; errorCode = "local-deletion-pending"; return projection(state) as NSDictionary }
        }
        if state["identity"] is [String: Any] && activeIdentity(state) == nil {
          clearSession(&state); markPreviewClear("all", state: &state); try storage.write(state)
        }
        if state["pendingPreviewClear"] is String {
          do { try finishPreviewClear(&state) }
          catch { syncState = "error"; errorCode = CompanionError.previewCleanupPending.code; return projection(state) as NSDictionary }
        }
        if activeIdentity(state) != nil {
          do { try refresh(&state); syncState = "idle"; errorCode = nil }
          catch { syncState = (error as? CompanionError)?.code == "offline" ? "offline" : "error"; errorCode = (error as? CompanionError)?.code ?? "unavailable" }
        }
      case "configure":
        guard let endpoint = params["endpoint"] as? String, Self.validEndpoint(endpoint) else { throw CompanionError.invalidRequest }
        let canonical = try Self.canonicalEndpoint(endpoint)
        if state["endpoint"] as? String != canonical {
          clearSession(&state); state["endpoint"] = canonical
          state["localDataAccountId"] = NSNull(); state["localDataEndpoint"] = NSNull()
          state["lastExportValues"] = [String: Any](); state["entityClocks"] = [String: Any](); state["customFoodTombstones"] = [String]()
          try persistPreviewRevocation("all", state: &state)
        }
      case "register", "login": try authenticate(action, params: params, state: &state)
      case "logout":
        var remoteFailure: Error?
        if activeIdentity(state) != nil { do { _ = try request(&state, method: "DELETE", path: "/v1/sessions/current") } catch { remoteFailure = error } }
        clearSession(&state); try persistPreviewRevocation("all", state: &state)
        if let failure = remoteFailure { errorCode = (failure as? CompanionError)?.code ?? "offline" }
      case "deleteAccount":
        try deleteAccount(params, state: &state)
      case "confirmAccountDeletionLocalData":
        try confirmAccountDeletionLocalData(params, state: &state)
      case "createInvitation": additions["invitationCode"] = try createInvitation(params, state: &state)
      case "acceptInvitation": try acceptInvitation(params, state: &state)
      case "confirmInvitation":
        let id = try parameterId(params)
        let response = try request(&state, method: "POST", path: "/v1/invites/" + id + "/confirm", body: [:])
        guard let invite = response["invite"] as? [String: Any], let group = response["group"] as? [String: Any] else { throw CompanionError.invalidResponse }
        try activate(invite, group: group, state: &state); try queueKeyring(&state); try storage.write(state); try refresh(&state)
      case "cancelInvitation":
        let id = try parameterId(params); _ = try request(&state, method: "DELETE", path: "/v1/invites/" + id)
        var pending = state["pendingInvites"] as! [String: Any]; pending.removeValue(forKey: id); state["pendingInvites"] = pending
        try storage.write(state); try refresh(&state)
      case "setSharing":
        guard let values = params["categories"] as? [String], Set(values).count == values.count,
          values.allSatisfy(Self.categories.contains) else { throw CompanionError.invalidRequest }
        try refresh(&state)
        let group = try family(state), account = try identity(state)["accountId"] as! String
        let peer = try peerId(group, account: account)
        var consent = state["selectedOutgoingCategories"] as! [String: Any]
        consent[consentScope(group, state: state)] = values; state["selectedOutgoingCategories"] = consent
        try applyGroup(group, state: &state); try storage.write(state)
        let result = try request(&state, method: "PUT", path: "/v1/groups/" + (group["id"] as! String) + "/grants",
          body: ["epoch": group["epoch"]!, "recipientId": peer, "categories": values])
        try applyGroup(result, state: &state); try storage.write(state)
      case "attachLocalData":
        let account = try identity(state)["accountId"] as! String
        guard state["deviceAuthorized"] as? Bool == true else { throw CompanionError.notAuthorized }
        let rr = try CompanionStateFile.integer(params["expectedRecordsRevision"]), pr = try CompanionStateFile.integer(params["expectedPersonalRevision"])
        try data.attach(Int(rr), Int(pr)) { payload in
          if state["localDataAccountId"] as? String != account || state["localDataEndpoint"] as? String != state["endpoint"] as? String {
            state["localDataAccountId"] = account; state["localDataEndpoint"] = state["endpoint"]!
            state["lastVault"] = NSNull(); state["lastExportValues"] = [String: Any](); state["entityClocks"] = [String: Any](); state["customFoodTombstones"] = [String]()
            state["cursors"] = [String: Any](); state["acks"] = [String: Any]()
          }
          try queueVault(payload, state: &state); try storage.write(state)
        }
      case "sync":
        syncState = "syncing"
        try refresh(&state)
        guard state["deviceAuthorized"] as? Bool == true else { throw CompanionError.notAuthorized }
        let account = try identity(state)["accountId"] as! String
        let attached = state["localDataAccountId"] as? String == account && state["localDataEndpoint"] as? String == state["endpoint"] as? String
        // Drain persisted batches before adding a fresh large photo snapshot. Each group owns
        // its complete ciphertext batch until confirmed; no duplicate raw payload is retained.
        // Pull durable keyrings first: relogin must not overwrite its own prior keyring
        // with an empty record before recovering the active family key.
        try syncGroup(vault(state), state: &state)
        try queueKeyring(&state); try storage.write(state)
        try syncGroup(vault(state), state: &state)
        if let group = familyOrNil(state) { try syncGroup(group, state: &state) }
        if attached {
          try queueVault(data.exportPayload(), state: &state); try storage.write(state)
          try syncGroup(vault(state), state: &state)
          if let group = familyOrNil(state) {
            try queueFamily(data.exportPayload(), state: &state); try storage.write(state)
            try syncGroup(group, state: &state)
          }
        }
        state["lastSyncAt"] = timestamp(now()); try storage.write(state)
        additions["hostData"] = try data.hostData(); additions["personal"] = try data.personal()
        syncState = "idle"; errorCode = nil
      case "sendEncouragement":
        guard let text = params["text"] as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
          text.utf16.count <= 2000 else { throw CompanionError.invalidRequest }
        try refresh(&state)
        let group = try family(state), account = try identity(state)["accountId"] as! String, peer = try peerId(group, account: account)
        guard selectedGrants(group, state: state).contains("encouragement"),
          grants(group, sender: peer, recipient: account).contains("encouragement") else { throw CompanionError.sharingDisabled }
        let created = timestamp(now()), id = UUID().uuidString
        try queue(["version": 1, "kind": "encouragement", "text": text, "createdAt": created], group: group,
          recordId: id, category: "encouragement", kind: "encouragement", id: id, state: &state)
        var messages = state["messages"] as! [[String: Any]]
        guard messages.count < 1000 else { throw CompanionError.invalidRequest }
        messages.append(["id": id, "text": text, "createdAt": created, "direction": "outgoing", "status": "pending"])
        state["messages"] = messages; try storage.write(state)
        try syncGroup(group, state: &state)
      case "unlink":
        guard params["deletePeerCache"] as? Bool == true else { throw CompanionError.invalidRequest }
        let group = try family(state)
        _ = try request(&state, method: "DELETE", path: "/v1/groups/" + (group["id"] as! String), body: ["epoch": group["epoch"]!])
        let account = try identity(state)["accountId"] as! String, scope = namespace(state, account: account)
        var revoked = state["revokedFamilies"] as! [String: Any]
        revoked[scope] = Array(Set(revoked[scope] as? [String] ?? []).union([group["id"] as! String])).sorted()
        state["revokedFamilies"] = revoked
        clearFamily(&state); try persistPreviewRevocation("partner", state: &state)
        try queueKeyring(&state); try storage.write(state)
      default: throw CompanionError.invalidRequest
      }
      var result = projection(state); result.merge(additions) { _, new in new }; return result as NSDictionary
    } catch {
      // The three-store journal may have committed even when its cleanup failed.
      // Never reuse an old in-memory intent over the committed localDataCleared marker.
      if state["pendingAccountDeletion"] is [String: Any] { state = (try? storage.load()) ?? state }
      syncState = (error as? CompanionError)?.code == "offline" ? "offline" : "error"
      errorCode = (error as? CompanionError)?.code ?? "unavailable"
      throw error
    }
  }

  private func deleteAccount(_ params: [String: Any], state: inout [String: Any]) throws {
    guard Set(params.keys) == Set(["password", "deleteLocalData"]),
      let password = params["password"] as? String, password.utf16.count >= 12, password.utf16.count <= 256 else { throw CompanionError.invalidRequest }
    let deleteLocal = try CompanionStateFile.boolean(params["deleteLocalData"])
    if state["pendingAccountDeletion"] is NSNull {
      guard (try? CompanionStateFile.boolean(state["deviceAuthorized"])) == true else { throw CompanionError.notAuthorized }
      let original = try identity(state), payload = try data.exportPayload()
      state["pendingAccountDeletion"] = ["version": 1, "operationId": UUID().uuidString,
        "proof": try NativeCrypto.random(32).base64EncodedString(), "endpoint": state["endpoint"]!,
        "accountId": original["accountId"]!, "login": original["login"]!,
        "displayName": String(decoding: (original["login"] as! String).utf16.prefix(100), as: UTF16.self), "deleteLocalData": deleteLocal,
        "expectedRecordsRevision": (payload["records"] as! [String: Any])["revision"]!,
        "expectedPersonalRevision": (payload["personal"] as! [String: Any])["revision"]!,
        "phase": "prepared", "localDataCleared": false]
      // Failure here means no deletion HTTP request has been sent.
      try storage.write(state)
    }
    let intent = state["pendingAccountDeletion"] as! [String: Any]
    if intent["phase"] as? String != "prepared" { try recoverAccountDeletion(&state); return }
    guard intent["deleteLocalData"] as? Bool == deleteLocal else { throw CompanionError.invalidRequest }
    if try probeAccountDeletion(intent) { try confirmRemoteDeletion(&state); try finishAccountDeletion(&state); return }
    // A password is never persisted or retried automatically. Even an expired private
    // session only supplies the original login; a recreated account must fail the ID check.
    guard let login = intent["login"] as? String else { throw CompanionError.notAuthenticated }
    let session = try http.request(endpoint: deletionEndpoint(intent), method: "POST", path: "/v1/sessions",
      body: ["login": login, "password": password, "deviceId": state["deviceId"]!, "deviceProof": state["deviceProof"]!], token: nil)
    guard session["accountId"] as? String == intent["accountId"] as? String,
      session["deviceId"] as? String == state["deviceId"] as? String,
      (try? CompanionStateFile.boolean(session["deviceAuthorized"])) == true,
      let token = session["token"] as? String, !token.isEmpty else { throw CompanionError.notAuthorized }
    _ = try CompanionStateFile.integer(session["expiresAt"])
    _ = try http.request(endpoint: deletionEndpoint(intent), method: "DELETE", path: "/v1/accounts/current",
      body: ["password": password, "operationId": intent["operationId"]!, "proof": intent["proof"]!], token: token)
    // DELETE success alone is insufficient: require the exact proof-authenticated receipt.
    guard try probeAccountDeletion(intent) else { throw CompanionError.accountDeletionPending }
    try confirmRemoteDeletion(&state); try finishAccountDeletion(&state)
  }
  private func deletionEndpoint(_ intent: [String: Any]) throws -> URL {
    guard let value = intent["endpoint"] as? String, Self.validEndpoint(value), let endpoint = URL(string: value) else { throw CompanionError.persistence }
    return endpoint
  }
  private func deletionRequest(_ intent: [String: Any], suffix: String) throws -> [String: Any] {
    try http.request(endpoint: deletionEndpoint(intent), method: "POST",
      path: "/v1/account-deletions/" + (intent["operationId"] as! String) + "/" + suffix,
      body: ["proof": intent["proof"]!], token: nil)
  }
  private func deletionReceiptAbsent(_ error: Error) -> Bool {
    if case CompanionError.http("deletion_not_found", _) = error { return true }
    return false
  }
  private func probeAccountDeletion(_ intent: [String: Any]) throws -> Bool {
    let receipt: [String: Any]
    do { receipt = try deletionRequest(intent, suffix: "receipt") }
    catch { if deletionReceiptAbsent(error) { return false }; throw error }
    guard Set(receipt.keys) == Set(["version", "operationId", "accountId", "status", "deletedAt"]),
      try CompanionStateFile.integer(receipt["version"]) == 1,
      receipt["operationId"] as? String == intent["operationId"] as? String,
      receipt["accountId"] as? String == intent["accountId"] as? String,
      receipt["status"] as? String == "deleted" else { throw CompanionError.invalidResponse }
    _ = try CompanionStateFile.integer(receipt["deletedAt"])
    return true
  }
  private func confirmRemoteDeletion(_ state: inout [String: Any]) throws {
    var intent = state["pendingAccountDeletion"] as! [String: Any]
    guard intent["phase"] as? String == "prepared" else { return }
    var keys = state["accountKeys"] as! [String: Any]
    keys.removeValue(forKey: namespace(state, account: intent["accountId"] as! String)); state["accountKeys"] = keys
    clearSession(&state); state["localDataAccountId"] = NSNull(); state["localDataEndpoint"] = NSNull()
    state["lastExportValues"] = [String: Any](); state["entityClocks"] = [String: Any](); state["customFoodTombstones"] = [String]()
    intent["phase"] = "confirmed"; state["pendingAccountDeletion"] = intent
    state["pendingLocalDeletion"] = intent["deleteLocalData"]!
    markPreviewClear("all", state: &state)
    // The private receipt and logical revocation are durable before cleanup.
    try storage.write(state)
  }
  private func recoverAccountDeletion(_ state: inout [String: Any]) throws {
    guard let intent = state["pendingAccountDeletion"] as? [String: Any] else { return }
    if intent["phase"] as? String == "prepared" {
      guard try probeAccountDeletion(intent) else { throw CompanionError.accountDeletionPending }
      try confirmRemoteDeletion(&state)
    }
    try finishAccountDeletion(&state)
  }
  private func finishAccountDeletion(_ state: inout [String: Any]) throws {
    guard var intent = state["pendingAccountDeletion"] as? [String: Any] else { return }
    if intent["phase"] as? String == "confirmed" {
      if intent["deleteLocalData"] as? Bool == true {
        if intent["localDataCleared"] as? Bool != true {
          guard let commit = data.commitAccountDeletion else { throw CompanionError.persistence }
          let payload = try data.exportPayload()
          let records = try CompanionStateFile.integer((payload["records"] as! [String: Any])["revision"])
          let personal = try CompanionStateFile.integer((payload["personal"] as! [String: Any])["revision"])
          guard records == (try CompanionStateFile.integer(intent["expectedRecordsRevision"])),
            personal == (try CompanionStateFile.integer(intent["expectedPersonalRevision"])) else { throw CompanionError.accountDeletionLocalDataChanged }
          var committed = state; intent["localDataCleared"] = true; committed["pendingAccountDeletion"] = intent
          try commit(Int(records), Int(personal), storage.file, committed)
          // Load the journal's actual receipt rather than trusting callback memory.
          state = try storage.load(); intent = state["pendingAccountDeletion"] as! [String: Any]
        }
        guard let cleanup = data.finishAccountDeletionCleanup else { throw CompanionError.persistence }
        guard let exists = data.accountDeletionLocalDataExists else { throw CompanionError.persistence }
        if try exists() { throw CompanionError.accountDeletionKeyCleanupConflict }
        do { try cleanup() }
        catch {
          if (try? exists()) == true { throw CompanionError.accountDeletionKeyCleanupConflict }
          throw error
        }
      }
      try finishPreviewClear(&state)
      state["pendingLocalDeletion"] = false
      intent["phase"] = "local-complete"; state["pendingAccountDeletion"] = intent; try storage.write(state)
    }
    guard intent["phase"] as? String == "local-complete" else { throw CompanionError.persistence }
    // Old receipts can predate stable key migration. Verify without deleting or opening
    // recreated data; an unverified orphan alias must not be acknowledged as cleaned up.
    if intent["deleteLocalData"] as? Bool == true { try data.validateAccountDeletionCompletion() }
    do {
      let acknowledgment = try deletionRequest(intent, suffix: "ack")
      guard Set(acknowledgment.keys) == Set(["version", "operationId", "status"]),
        try CompanionStateFile.integer(acknowledgment["version"]) == 1,
        acknowledgment["operationId"] as? String == intent["operationId"] as? String,
        acknowledgment["status"] as? String == "acknowledged" else { throw CompanionError.invalidResponse }
    } catch { if !deletionReceiptAbsent(error) { throw error } }
    state["pendingAccountDeletion"] = NSNull(); try storage.write(state); errorCode = nil; syncState = "idle"
  }
  private func confirmAccountDeletionLocalData(_ params: [String: Any], state: inout [String: Any]) throws {
    guard Set(params.keys) == Set(["deleteLocalData", "expectedRecordsRevision", "expectedPersonalRevision"]),
      var intent = state["pendingAccountDeletion"] as? [String: Any], intent["phase"] as? String == "confirmed" else { throw CompanionError.invalidRequest }
    let deleteLocal = try CompanionStateFile.boolean(params["deleteLocalData"])
    if intent["localDataCleared"] as? Bool == true && deleteLocal { throw CompanionError.invalidRequest }
    let records = try CompanionStateFile.integer(params["expectedRecordsRevision"]), personal = try CompanionStateFile.integer(params["expectedPersonalRevision"])
    // The adapter's existing locked CAS validates this explicit new snapshot before saving.
    try data.attach(Int(records), Int(personal)) { _ in
      intent["deleteLocalData"] = deleteLocal; intent["expectedRecordsRevision"] = records; intent["expectedPersonalRevision"] = personal
      state["pendingAccountDeletion"] = intent; state["pendingLocalDeletion"] = deleteLocal; try storage.write(state)
    }
    try finishAccountDeletion(&state)
  }

  private func authenticate(_ action: String, params: [String: Any], state: inout [String: Any]) throws {
    guard let login = params["login"] as? String, login.utf16.count >= 3, login.utf16.count <= 128,
      let password = params["password"] as? String, password.utf16.count >= 12, password.utf16.count <= 256 else { throw CompanionError.invalidRequest }
    _ = try endpoint(state)
    if state["deviceId"] as? String == "" { state["deviceId"] = UUID().uuidString; state["deviceProof"] = try NativeCrypto.random(32).base64EncodedString(); try storage.write(state) }
    let pendingScope = (state["endpoint"] as! String) + ":" + login.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if action == "register" {
      var pending = state["pendingAccountKeys"] as! [String: Any]
      if pending[pendingScope] == nil { pending[pendingScope] = try NativeCrypto.random(32).base64EncodedString() }
      state["pendingAccountKeys"] = pending; try storage.write(state)
    }
    let response: [String: Any]
    var credentials: [String: Any] = ["login": login, "password": password, "deviceId": state["deviceId"]!, "deviceProof": state["deviceProof"]!]
    if action == "register", let admission = params["admissionToken"] {
      guard let text = admission as? String, text.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else { throw CompanionError.invalidRequest }
      credentials["admissionToken"] = text
    }
    do {
      response = try http.request(endpoint: endpoint(state), method: "POST", path: action == "register" ? "/v1/accounts" : "/v1/sessions",
        body: credentials, token: nil)
    } catch {
      // A retry may return account-exists after a committed response was lost.
      // Keep the provisional key until an authorized same-proof login consumes it.
      throw error
    }
    guard let account = response["accountId"] as? String, CompanionCrypto.validId(account),
      let vaultId = response["vaultId"] as? String, CompanionCrypto.validId(vaultId),
      let token = response["token"] as? String, !token.isEmpty, let authorized = response["deviceAuthorized"] as? Bool,
      response["deviceId"] as? String == state["deviceId"] as? String else { throw CompanionError.invalidResponse }
    _ = try CompanionStateFile.integer(response["expiresAt"])
    let replacingSession = state["identity"] is [String: Any]
    clearSession(&state)
    if replacingSession { try persistPreviewRevocation("all", state: &state) }
    var session = response; session["login"] = login.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    state["identity"] = session; state["deviceAuthorized"] = authorized
    var keys = state["accountKeys"] as! [String: Any], pending = state["pendingAccountKeys"] as! [String: Any]
    if authorized, keys[namespace(state, account: account)] == nil, let provisional = pending[pendingScope] {
      _ = try CompanionCrypto.base64(provisional, count: 32)
      keys[namespace(state, account: account)] = ["vaultId": vaultId, "key": provisional]
      state["accountKeys"] = keys; pending.removeValue(forKey: pendingScope); state["pendingAccountKeys"] = pending
    }
    state["groups"] = [vaultId: ["id": vaultId, "kind": "vault", "epoch": 1, "members": [account], "grants": [String: Any]()]]
    try storage.write(state); try refresh(&state); errorCode = nil; syncState = "idle"
  }
  private func createInvitation(_ params: [String: Any], state: inout [String: Any]) throws -> String {
    guard let kind = params["kind"] as? String, ["family", "device"].contains(kind), state["deviceAuthorized"] as? Bool == true else { throw CompanionError.invalidRequest }
    let account = try identity(state)["accountId"] as! String
    try refresh(&state)
    for invitation in state["invitations"] as! [[String: Any]] {
      guard invitation["kind"] as? String == kind, invitation["creatorId"] as? String == account,
        invitation["creatorDeviceId"] as? String == state["deviceId"] as? String,
        ["open", "pending"].contains(invitation["status"] as? String ?? ""),
        (invitation["expiresAt"] as? NSNumber)?.doubleValue ?? 0 > now().timeIntervalSince1970 * 1000,
        let id = invitation["id"] as? String, let existing = (state["pendingInvites"] as! [String: Any])[id] as? [String: Any] else { continue }
      return try CompanionCrypto.invitationCode(id: id, secret: CompanionCrypto.base64(existing["secret"], count: 32))
    }
    let id = UUID().uuidString, secret = try NativeCrypto.random(32)
    let groupKey: Data
    if kind == "device" { groupKey = try key(try vault(state), state: state) } else { groupKey = try NativeCrypto.random(32) }
    let wrapKey = CompanionCrypto.hkdf(secret: secret, id: id, info: "leanon-invite-wrap-v1").withUnsafeBytes { Data($0) }
    let wrapped = try CompanionCrypto.seal(groupKey, key: wrapKey, aad: Data(id.utf8))
    var pending = state["pendingInvites"] as! [String: Any]
    pending[id] = ["secret": secret.base64EncodedString(), "key": groupKey.base64EncodedString(), "kind": kind, "accountId": account]
    state["pendingInvites"] = pending; try storage.write(state)
    let invite = try request(&state, method: "POST", path: "/v1/invites", body: ["id": id, "kind": kind,
      "proofHash": CompanionCrypto.proofHash(CompanionCrypto.proof(secret: secret, id: id)), "wrappedKey": wrapped, "expiresInSeconds": 600])
    try validateInvite(invite)
    guard invite["id"] as? String == id else { throw CompanionError.invalidResponse }
    var entry = pending[id] as! [String: Any]; entry["groupId"] = invite["groupId"]; pending[id] = entry
    state["pendingInvites"] = pending; try storage.write(state); try refresh(&state)
    return try CompanionCrypto.invitationCode(id: id, secret: secret)
  }
  private func acceptInvitation(_ params: [String: Any], state: inout [String: Any]) throws {
    guard let code = params["code"] as? String else { throw CompanionError.invalidRequest }
    let parsed = try CompanionCrypto.parseInvitation(code), account = try identity(state)["accountId"] as! String
    // Persist the secret before acceptance, so a network or process failure remains recoverable.
    var pending = state["pendingInvites"] as! [String: Any]
    pending[parsed.id] = ["secret": parsed.secret.base64EncodedString(), "accountId": account]
    state["pendingInvites"] = pending; try storage.write(state)
    let invite = try request(&state, method: "POST", path: "/v1/invites/" + parsed.id + "/accept",
      body: ["proof": CompanionCrypto.proof(secret: parsed.secret, id: parsed.id).base64EncodedString()])
    try rememberAccepted(invite, state: &state); try storage.write(state); try refresh(&state)
  }
  private func rememberAccepted(_ invite: [String: Any], state: inout [String: Any]) throws {
    try validateInvite(invite)
    guard let id = invite["id"] as? String, let groupId = invite["groupId"] as? String, CompanionCrypto.validId(groupId),
      let kind = invite["kind"] as? String, ["family", "device"].contains(kind) else { throw CompanionError.invalidResponse }
    var pending = state["pendingInvites"] as! [String: Any]
    guard var entry = pending[id] as? [String: Any] else { throw CompanionError.missingKey }
    if entry["key"] == nil {
      let secret = try CompanionCrypto.base64(entry["secret"], count: 32)
      let wrapKey = CompanionCrypto.hkdf(secret: secret, id: id, info: "leanon-invite-wrap-v1").withUnsafeBytes { Data($0) }
      let raw = try CompanionCrypto.open(invite["wrappedKey"], key: wrapKey, aad: Data(id.utf8))
      guard raw.count == 32 else { throw CompanionError.invalidResponse }; entry["key"] = raw.base64EncodedString()
    }
    entry["groupId"] = groupId; entry["kind"] = kind; pending[id] = entry; state["pendingInvites"] = pending
  }
  private func activate(_ invite: [String: Any], group: [String: Any], state: inout [String: Any]) throws {
    try rememberAccepted(invite, state: &state)
    guard invite["status"] as? String == "accepted", let id = invite["id"] as? String,
      let groupId = group["id"] as? String, groupId == invite["groupId"] as? String,
      let entry = (state["pendingInvites"] as! [String: Any])[id] as? [String: Any] else { throw CompanionError.invalidResponse }
    let account = try identity(state)["accountId"] as! String
    _ = try CompanionCrypto.base64(entry["key"], count: 32)
    if invite["kind"] as? String == "device" {
      var keys = state["accountKeys"] as! [String: Any]; keys[namespace(state, account: account)] = ["vaultId": groupId, "key": entry["key"]!]; state["accountKeys"] = keys
    } else { state["familyKey"] = ["groupId": groupId, "accountId": account, "key": entry["key"]!] }
    try applyGroup(group, state: &state)
  }
  private func refresh(_ state: inout [String: Any]) throws {
    let me = try request(&state, method: "GET", path: "/v1/me"), account = try identity(state)["accountId"] as! String
    guard me["accountId"] as? String == account, me["deviceId"] as? String == state["deviceId"] as? String,
      let authorized = me["deviceAuthorized"] as? Bool, let invitations = me["invites"] as? [[String: Any]] else { throw CompanionError.invalidResponse }
    for invite in invitations { try validateInvite(invite) }
    if me["protocol"] != nil { guard try CompanionStateFile.integer(me["protocol"]) == 2 else { throw CompanionError.invalidResponse }; wireProtocol = 2 } else { wireProtocol = 1 }
    state["deviceAuthorized"] = authorized; state["invitations"] = invitations
    if let remoteVault = me["vault"] as? [String: Any] { guard remoteVault["id"] as? String == (try identity(state))["vaultId"] as? String else { throw CompanionError.invalidResponse }; try applyGroup(remoteVault, state: &state) }
    let newFamily = me["family"] as? [String: Any]
    let previous = familyOrNil(state)
    if let id = newFamily?["id"] as? String,
      ((state["revokedFamilies"] as! [String: Any])[namespace(state, account: account)] as? [String] ?? []).contains(id) {
      clearFamily(&state); try persistPreviewRevocation("partner", state: &state); throw CompanionError.notAuthorized
    }
    if let oldId = previous?["id"] as? String, newFamily?["id"] as? String != oldId {
      var revoked = state["revokedFamilies"] as! [String: Any], scope = namespace(state, account: account)
      revoked[scope] = Array(Set(revoked[scope] as? [String] ?? []).union([oldId])).sorted(); state["revokedFamilies"] = revoked
      clearFamily(&state); try persistPreviewRevocation("partner", state: &state)
    }
    for invite in invitations where invite["status"] as? String == "accepted" {
      if let id = invite["id"] as? String, (state["pendingInvites"] as! [String: Any])[id] != nil {
        let group = invite["kind"] as? String == "device" ? try vault(state) : newFamily
        if let group { try activate(invite, group: group, state: &state) }
      }
    }
    if let group = newFamily { try applyGroup(group, state: &state) }
    try storage.write(state)
  }

  private func queueKeyring(_ state: inout [String: Any]) throws {
    var familyKeys: [String: Any] = [:]
    if let group = familyOrNil(state) {
      guard let entry = state["familyKey"] as? [String: Any], entry["groupId"] as? String == group["id"] as? String else { throw CompanionError.missingKey }
      _ = try key(group, state: state); familyKeys[group["id"] as! String] = entry["key"]!
    }
    let value: [String: Any] = ["version": 1, "kind": "account-keyring", "familyKeys": familyKeys]
    if let previous = state["lastKeyring"] as? [String: Any], try CompanionVault.same(previous, value) { return }
    try queue(value, group: vault(state), recordId: "keyring-" + (state["deviceId"] as! String), category: "vault-keyring", kind: "record", id: UUID().uuidString, state: &state)
    state["lastKeyring"] = value
  }
  private func receiveKeyring(_ value: [String: Any], state: inout [String: Any]) throws {
    guard Set(value.keys) == Set(["version", "kind", "familyKeys"]), value["kind"] as? String == "account-keyring",
      let keys = value["familyKeys"] as? [String: Any], keys.count <= 1000 else { throw CompanionError.invalidResponse }
    for (id, key) in keys { guard CompanionCrypto.validId(id) else { throw CompanionError.invalidResponse }; _ = try CompanionCrypto.base64(key, count: 32) }
    guard let active = familyOrNil(state), let groupId = active["id"] as? String, let raw = keys[groupId] else { return }
    let account = try identity(state)["accountId"] as! String
    if let existing = state["familyKey"] as? [String: Any], existing["groupId"] as? String == groupId,
      existing["key"] as? String != raw as? String { throw CompanionError.invalidResponse }
    state["familyKey"] = ["groupId": groupId, "accountId": account, "key": raw]
  }
  private func queueVault(_ payload: [String: Any], state: inout [String: Any]) throws {
    let account = try identity(state)["accountId"] as! String
    guard state["localDataAccountId"] as? String == account else { throw CompanionError.notAuthorized }
    let previous = state["lastVault"] as? String, stamp = try clock(&state)
    let wire = try CompanionVault.export(payload, state: &state, clock: stamp)
    try CompanionVault.validate(wire)
    let digest = try CompanionVault.wireDigest(wire)
    if previous == digest { return }
    let group = try vault(state)
    try queue(wire, group: group, recordId: "vault-snapshot-" + (state["deviceId"] as! String), category: "vault", kind: "record", id: stamp.changeId, state: &state, timestamp: stamp.updatedAt)
    state["lastVault"] = digest
  }
  private func queue(_ value: [String: Any], group: [String: Any], recordId: String, category: String, kind: String,
    id: String, state: inout [String: Any], timestamp: Int64? = nil) throws {
    let identity = try self.identity(state), groupId = group["id"] as! String, stamp = try timestamp ?? clock(&state).updatedAt
    var change: [String: Any] = ["id": id, "recordId": recordId, "category": category, "kind": kind, "updatedAt": stamp, "deleted": false]
    let aad = try CompanionCrypto.aad(group: groupId, epoch: Int(CompanionStateFile.integer(group["epoch"])),
      owner: identity["accountId"] as! String, device: state["deviceId"] as! String, change: change)
    let groupKey = try key(group, state: state)
    let prepared = wireProtocol == 2 ? try CompanionPhotos.prepare(value, groupKey: groupKey, group: groupId,
      epoch: CompanionStateFile.integer(group["epoch"]), owner: identity["accountId"] as! String, device: state["deviceId"] as! String) : (plain: value, objects: [[String: Any]](), packets: [[String: Any]]())
    let bytes = try CompanionCrypto.json(prepared.plain)
    guard bytes.count <= (wireProtocol == 2 ? 128 * 1024 : 64 * 1024 * 1024) else { throw CompanionError.capacity }
    change["payload"] = try CompanionCrypto.seal(bytes, key: groupKey, aad: aad)
    if !prepared.objects.isEmpty { change["objects"] = prepared.objects; change["_photoPackets"] = prepared.packets }
    var outbox = state["outbox"] as! [String: Any], changes = outbox[groupId] as? [[String: Any]] ?? []
    guard changes.count < 10_000 else { throw CompanionError.invalidRequest }; changes.append(change); outbox[groupId] = changes; state["outbox"] = outbox
  }
  private func queueFamily(_ payload: [String: Any], state: inout [String: Any]) throws {
    guard let group = familyOrNil(state) else { return }
    for category in selectedGrants(group, state: state) where category != "encouragement" {
      let value = try familyValue(category, payload: payload)
      // Use a digest stored alongside the outbox to avoid resending unchanged category data.
      var exported = state["familyExports"] as! [String: Any]
      let cacheKey = "family-" + (group["id"] as! String) + "-" + category
      let digest = try CompanionVault.digest(value)
      if exported[cacheKey] as? String == digest { continue }
      try queue(value, group: group, recordId: "category-" + category, category: category, kind: "record", id: UUID().uuidString, state: &state)
      exported[cacheKey] = digest; state["familyExports"] = exported
    }
  }
  private func familyValue(_ category: String, payload: [String: Any]) throws -> [String: Any] {
    let records = payload["records"] as! [String: Any], personal = payload["personal"] as! [String: Any]
    var result: [String: Any] = ["version": 1, "kind": "family-category", "category": category]
    switch category {
    case "goal":
      var goal: [String: Any] = ["guidanceMode": records["guidanceMode"]!]
      if let weekly = records["weeklyLossKg"] as? NSNumber { goal["weeklyLossKg"] = weekly }; result["data"] = goal
    case "progress_band":
      let weights = try CompanionVault.rows(records["weights"]).sorted { ($0["date"] as? String ?? "") < ($1["date"] as? String ?? "") }
      if weights.count < 2 { result["data"] = "insufficient-data" }
      else {
        let first = (weights.first?["weightKg"] as? NSNumber)?.doubleValue ?? 0, last = (weights.last?["weightKg"] as? NSNumber)?.doubleValue ?? 0
        result["data"] = abs(last - first) < 0.5 ? "maintaining" : "changing"
      }
    case "checkin_streak":
      var dates = Set<String>()
      for field in ["weights", "water", "exercises", "intakeEntries", "legacyIntake"] {
        for row in try CompanionVault.rows(records[field]) { if let date = row["date"] as? String { dates.insert(date) } }
      }
      var date = now(), streak = 0, calendar = RecordsStore.currentCalendar()
      let formatter = DateFormatter(); formatter.calendar = calendar; formatter.timeZone = calendar.timeZone; formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
      if !dates.contains(formatter.string(from: date)), let yesterday = calendar.date(byAdding: .day, value: -1, to: date) { date = yesterday }
      while dates.contains(formatter.string(from: date)) && streak < 100000 {
        streak += 1; guard let previous = calendar.date(byAdding: .day, value: -1, to: date) else { break }; date = previous
      }
      result["data"] = streak
    case "exact_weight":
      let weights = try CompanionVault.rows(records["weights"]).sorted { ($0["date"] as? String ?? "") < ($1["date"] as? String ?? "") }
      result["data"] = weights.last?["weightKg"] ?? NSNull()
    case "meals":
      result["data"] = try CompanionVault.rows(records["intakeEntries"]).suffix(1000).map { row -> [String: Any] in
        ["date": row["date"]!, "name": row["name"] ?? row["foodName"] ?? "", "kcal": row["kcal"]!]
      }
    case "photos": result["data"] = personal["photos"]!; result["photoBytes"] = payload["photos"]!
    case "body_measurements": result["data"] = personal["measurements"]!
    case "menstrual": result["data"] = [[String: Any]]()
    default: throw CompanionError.invalidRequest
    }
    try CompanionPeerData.validate(category, value: result)
    return result
  }
  private func syncGroup(_ initialGroup: [String: Any], state: inout [String: Any]) throws {
    var group = initialGroup
    let groupId = group["id"] as! String, account = try identity(state)["accountId"] as! String
    var rounds = 0
    while rounds < 1000 {
      rounds += 1
      let outbox = state["outbox"] as! [String: Any], pending = outbox[groupId] as? [[String: Any]] ?? []
      let oldAcks = (state["acks"] as! [String: Any])[groupId] as? [String] ?? []
      let sentAcks = Array(oldAcks.prefix(wireProtocol == 2 ? 4 : 100))
      var sent: [[String: Any]] = [], size = 0
      for change in pending.prefix(wireProtocol == 2 ? 4 : 100) {
        let bytes = try CompanionCrypto.json(CompanionPhotos.wire(change)).count
        if size + bytes > (wireProtocol == 2 ? 512 * 1024 - 2048 : 95 * 1024 * 1024) { break }; sent.append(CompanionPhotos.wire(change)); size += bytes
        if wireProtocol == 2 { try uploadPhotos(change, group: group, state: &state) }
      }
      if !pending.isEmpty && sent.isEmpty { throw CompanionError.invalidRequest }
      let oldCursor = try CompanionStateFile.integer((state["cursors"] as! [String: Any])[groupId] ?? 0)
      let response = try request(&state, method: "POST", path: "/v1/groups/" + groupId + "/sync", body: [
        "epoch": group["epoch"]!, "cursor": oldCursor, "changes": sent, "acks": sentAcks])
      guard let returned = response["group"] as? [String: Any], returned["id"] as? String == groupId,
        let changes = response["changes"] as? [[String: Any]], changes.count <= 100,
        let receipts = response["receipts"] as? [[String: Any]] else { throw CompanionError.invalidResponse }
      let cursor = try CompanionStateFile.integer(response["cursor"])
      guard cursor >= oldCursor, try CompanionStateFile.integer(response["epoch"]) == CompanionStateFile.integer(returned["epoch"]) else { throw CompanionError.invalidResponse }
      try applyGroup(returned, state: &state); group = returned
      // Consent revocation is durable even if a later ciphertext fails authentication.
      try storage.write(state)
      var candidate = state, incomingAcks = Set<String>()
      var mergedWire: [String: Any]?
      var expectedRecords = 0, expectedPersonal = 0
      for change in changes {
        guard let owner = change["ownerId"] as? String, let device = change["deviceId"] as? String,
          let changeId = change["id"] as? String, CompanionCrypto.validId(changeId),
          let category = change["category"] as? String, let kind = change["kind"] as? String,
          let deleted = change["deleted"] as? Bool else { throw CompanionError.invalidResponse }
        _ = try CompanionStateFile.integer(change["sequence"])
        if owner == account && group["kind"] as? String == "family" && kind != "encouragement" { continue }
        if owner == account && device == state["deviceId"] as? String && group["kind"] as? String == "vault" && category != "vault-keyring" { continue }
        if group["kind"] as? String == "family", owner != account, category == "encouragement", !selectedGrants(group, state: candidate).contains("encouragement") { continue }
        let aad = try CompanionCrypto.aad(group: groupId, epoch: Int(CompanionStateFile.integer(group["epoch"])), owner: owner, device: device, change: change)
        if group["kind"] as? String == "vault", category != "vault-keyring",
          (candidate["localDataAccountId"] as? String != account || candidate["localDataEndpoint"] as? String != candidate["endpoint"] as? String) { continue }
        let plain = try CompanionCrypto.open(change["payload"], key: key(group, state: candidate), aad: aad)
        guard let decrypted = try JSONSerialization.jsonObject(with: plain) as? [String: Any] else { throw CompanionError.invalidResponse }
        let value = try CompanionPhotos.hydrate(decrypted, change: change, groupKey: key(group, state: candidate), group: groupId,
          epoch: CompanionStateFile.integer(group["epoch"]), owner: owner, device: device) { objectId in
          try self.http.binary(endpoint: self.endpoint(candidate), method: "GET", path: "/v2/groups/" + groupId + "/objects/" + objectId, bytes: nil, token: self.identity(candidate)["token"] as! String)
        }
        guard try CompanionStateFile.integer(value["version"]) == 1 else { throw CompanionError.invalidResponse }
        let remoteClock = try CompanionMergeClock(updatedAt: CompanionStateFile.integer(change["updatedAt"]), deviceId: device, changeId: changeId)
        candidate["latestTimestamp"] = max(try CompanionStateFile.integer(candidate["latestTimestamp"]), remoteClock.updatedAt)
        if group["kind"] as? String == "vault" {
          guard owner == account, kind == "record", !deleted else { throw CompanionError.notAuthorized }
          if category == "vault-keyring" {
            try receiveKeyring(value, state: &candidate); continue
          }
          guard category == "vault", candidate["localDataAccountId"] as? String == account,
            candidate["localDataEndpoint"] as? String == candidate["endpoint"] as? String else { throw CompanionError.notAuthorized }
          try CompanionVault.validate(value)
          if mergedWire == nil {
            let payload = try data.exportPayload()
            expectedRecords = Int(try CompanionStateFile.integer((payload["records"] as! [String: Any])["revision"]))
            expectedPersonal = Int(try CompanionStateFile.integer((payload["personal"] as! [String: Any])["revision"]))
            mergedWire = try CompanionVault.export(payload, state: &candidate, clock: clock(&candidate))
          }
          mergedWire = try CompanionVault.merge(local: mergedWire!, remote: value)
        } else {
          let peer = try peerId(group, account: account)
          guard owner == account || (owner == peer && grants(group, sender: peer, recipient: account).contains(category)) else { throw CompanionError.notAuthorized }
          if kind == "encouragement" {
            guard category == "encouragement", (owner == account || selectedGrants(group, state: candidate).contains(category)), !deleted,
              value["kind"] as? String == "encouragement", Set(value.keys) == Set(["version", "kind", "text", "createdAt"]),
              let text = value["text"] as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.utf16.count <= 2000,
              let created = value["createdAt"] as? String, PersonalSchema.validTimestamp(created) else { throw CompanionError.invalidResponse }
            var messages = candidate["messages"] as! [[String: Any]]
            if let old = messages.first(where: {$0["id"] as? String == changeId}) {
              guard old["text"] as? String == text, old["createdAt"] as? String == created else { throw CompanionError.invalidResponse }
            } else {
              guard messages.count < 1000 else { throw CompanionError.invalidResponse }
              messages.append(["id": changeId, "text": text, "createdAt": created, "direction": owner == account ? "outgoing" : "incoming", "status": "pending"])
            }
            candidate["messages"] = messages
            if owner != account { incomingAcks.insert(changeId) }
          } else {
            guard kind == "record", category != "encouragement" else { throw CompanionError.invalidResponse }
            var cache = candidate["peerCategories"] as! [String: Any]
            if deleted { cache.removeValue(forKey: category) }
            else {
              try CompanionPeerData.validate(category, value: value)
              if let previous = cache[category] as? [String: Any], let oldClock = previous["clock"] as? [String: Any] {
                let old = try CompanionMergeClock(oldClock)
                if try old == remoteClock && !CompanionVault.same(previous["value"]!, value) { throw CompanionError.invalidResponse }
                if old > remoteClock { continue }
              }
              cache[category] = ["clock": remoteClock.json, "value": value]
            }
            candidate["peerCategories"] = cache
          }
        }
      }
      var messages = candidate["messages"] as! [[String: Any]]
      for receipt in receipts {
        guard let id = receipt["id"] as? String, let recipient = receipt["recipientId"] as? String else { throw CompanionError.invalidResponse }
        let acknowledged = try CompanionStateFile.integer(receipt["acknowledgedAt"])
        if let index = messages.firstIndex(where: {$0["id"] as? String == id}) {
          let message = messages[index]
          let expectedRecipient = message["direction"] as? String == "incoming" ? account : try peerId(group, account: account)
          guard recipient == expectedRecipient else { throw CompanionError.invalidResponse }
          let delivered = Date(timeIntervalSince1970: Double(acknowledged) / 1000)
          messages[index]["status"] = "delivered"; messages[index]["deliveredAt"] = timestamp(delivered)
        }
      }
      candidate["messages"] = messages
      var queues = candidate["outbox"] as! [String: Any]
      let sentIds = Set(sent.compactMap {$0["id"] as? String})
      queues[groupId] = (queues[groupId] as? [[String: Any]] ?? []).filter {!sentIds.contains($0["id"] as? String ?? "")}; candidate["outbox"] = queues
      var ackQueues = candidate["acks"] as! [String: Any]
      ackQueues[groupId] = Array(Set(oldAcks.dropFirst(sentAcks.count)).union(incomingAcks)).sorted(); candidate["acks"] = ackQueues
      var cursors = candidate["cursors"] as! [String: Any]; cursors[groupId] = cursor; candidate["cursors"] = cursors
      if let mergedWire {
        let payload = mergedWire["payload"] as! [String: Any]
        candidate["entityClocks"] = mergedWire["clocks"]!
        candidate["lastExportValues"] = try CompanionVault.entities(payload)
        candidate["customFoodTombstones"] = (mergedWire["tombstones"] as! [String: Any])["customFoods"]!
        // The cursor and all stores share the same native transaction/restart journal.
        try data.commitPayload(payload, expectedRecords, expectedPersonal, storage.file, candidate)
      } else { try storage.write(candidate) }
      state = candidate
      let remaining = (state["outbox"] as! [String: Any])[groupId] as? [[String: Any]] ?? []
      let acknowledgments = (state["acks"] as! [String: Any])[groupId] as? [String] ?? []
      if cursor == oldCursor && remaining.isEmpty && acknowledgments.isEmpty { return }
    }
    throw CompanionError.http("sync-page-limit", true)
  }
  private func uploadPhotos(_ change: [String: Any], group: [String: Any], state: inout [String: Any]) throws {
    guard let packets = change["_photoPackets"] as? [[String: Any]] else { return }
    guard let refs = change["objects"] as? [[String: Any]], refs.count == packets.count, refs.count <= 64 else { throw CompanionError.invalidRequest }
    let groupId = group["id"] as! String
    for start in stride(from: 0, to: refs.count, by: 4) { _ = try request(&state, method: "POST", path: "/v2/groups/" + groupId + "/objects/reserve", body: ["epoch": group["epoch"]!, "objects": Array(refs[start..<min(start + 4, refs.count)])]) }
    for packet in packets {
      guard let object = packet["id"] as? String, let ref = refs.first(where: { $0["id"] as? String == object }) else { throw CompanionError.invalidRequest }
      let bytes = try CompanionCrypto.base64(packet["bytesBase64"])
      guard try Int64(bytes.count) == CompanionStateFile.integer(ref["size"]), CompanionCrypto.proofHash(bytes) == ref["digest"] as? String else { throw CompanionError.invalidRequest }
      let result = try http.binary(endpoint: endpoint(state), method: "PUT", path: "/v2/groups/" + groupId + "/objects/" + object, bytes: bytes, token: identity(state)["token"] as! String)
      guard let receipt = try JSONSerialization.jsonObject(with: result) as? [String: Any], receipt["ok"] as? Bool == true, receipt["id"] as? String == object else { throw CompanionError.invalidResponse }
    }
  }
  private func projection(_ state: [String: Any]) -> [String: Any] {
    let deletion = state["pendingAccountDeletion"] as? [String: Any]
    let active = deletion == nil ? activeIdentity(state) : nil, account = active?["accountId"] as? String
    let group = account == nil ? nil : familyOrNil(state)
    let peer = group.flatMap { try? peerId($0, account: account!) }
    let outgoing = group.map { selectedGrants($0, state: state) } ?? []
    let incoming = group.flatMap { grants($0, sender: peer ?? "", recipient: account!) } ?? []
    var companion: [String: Any] = ["version": 1, "account": NSNull(), "sessionExpiresAt": NSNull(), "binding": NSNull(),
      "shareSettings": ["mutual": false, "categories": [String]()], "peerSnapshot": NSNull(), "invitations": [[String: Any]](), "messages": [[String: Any]]()]
    if let active, let account {
      companion["account"] = ["id": account, "displayName": String(decoding: (active["login"] as! String).utf16.prefix(100), as: UTF16.self)]
      companion["sessionExpiresAt"] = timestamp(Date(timeIntervalSince1970: (active["expiresAt"] as! NSNumber).doubleValue / 1000))
      companion["invitations"] = (state["invitations"] as? [[String: Any]] ?? []).compactMap { invite -> [String: Any]? in
        guard let id = invite["id"] as? String, let status = invite["status"] as? String, ["open", "pending"].contains(status),
          let expiry = invite["expiresAt"] as? NSNumber, expiry.doubleValue > now().timeIntervalSince1970 * 1000 else { return nil }
        return ["id": id, "kind": invite["kind"]!, "direction": invite["creatorId"] as? String == account && invite["creatorDeviceId"] as? String == state["deviceId"] as? String ? "outgoing" : "incoming",
          "status": status == "pending" ? "awaiting-confirmation" : "pending", "expiresAt": timestamp(Date(timeIntervalSince1970: expiry.doubleValue / 1000)),
          "recipientId": invite["recipientId"] ?? NSNull(), "recipientDeviceId": invite["recipientDeviceId"] ?? NSNull()]
      }
      if let group, let peer {
        companion["binding"] = ["id": group["id"]!, "peer": ["id": peer, "displayName": peer], "createdAt": state["bindingCreatedAt"] as? String ?? timestamp(now())]
        companion["shareSettings"] = ["mutual": true, "categories": outgoing]
        companion["messages"] = state["messages"] as? [[String: Any]] ?? []
        let cache = state["peerCategories"] as? [String: Any] ?? [:]
        var snapshot: [String: Any] = ["updatedAt": state["lastSyncAt"] as? String ?? timestamp(now()), "sharedCategories": incoming]
        for category in incoming {
          if let field = CompanionPeerData.fields[category], let entry = cache[category] as? [String: Any],
            let value = entry["value"] as? [String: Any], let data = value["data"], !(data is NSNull) { snapshot[field] = data }
        }
        companion["peerSnapshot"] = snapshot
      }
    }
    let pending = (state["outbox"] as? [String: Any] ?? [:]).values.reduce(0) {$0 + (($1 as? [Any])?.count ?? 0)}
    var runtime: [String: Any] = ["endpoint": state["endpoint"] ?? NSNull(), "deviceAuthorized": active != nil && state["deviceAuthorized"] as? Bool == true,
      "localDataAccountId": state["localDataAccountId"] ?? NSNull(), "syncState": syncState, "pendingChanges": pending,
      "lastSyncAt": state["lastSyncAt"] ?? NSNull(), "nativeNow": timestamp(now()), "errorCode": errorCode as Any? ?? NSNull()]
    runtime["accountDeletion"] = NSNull()
    if let deletion {
      var changed = false
      if deletion["phase"] as? String == "confirmed", deletion["deleteLocalData"] as? Bool == true,
        deletion["localDataCleared"] as? Bool != true {
        if let snapshot = try? data.exportPayload(), let records = snapshot["records"] as? [String: Any], let personal = snapshot["personal"] as? [String: Any] {
          changed = (try? CompanionStateFile.integer(records["revision"])) != (try? CompanionStateFile.integer(deletion["expectedRecordsRevision"])) ||
            (try? CompanionStateFile.integer(personal["revision"])) != (try? CompanionStateFile.integer(deletion["expectedPersonalRevision"]))
        } else { changed = true }
      }
      if deletion["phase"] as? String == "confirmed", deletion["deleteLocalData"] as? Bool == true,
        deletion["localDataCleared"] as? Bool == true {
        changed = (try? data.accountDeletionLocalDataExists?()) ?? false
      }
      runtime["accountDeletion"] = ["phase": deletion["phase"]!, "accountId": deletion["accountId"]!,
        "displayName": deletion["displayName"]!, "deleteLocalData": deletion["deleteLocalData"]!, "localDataChanged": changed]
    }
    return ["companion": companion, "runtime": runtime]
  }
  /// Read-only projection after a durable revocation; never retries cache I/O or HTTP.
  func revokedProjection() throws -> NSDictionary {
    try storage.read { projection($0) as NSDictionary }
  }
  func peerPhoto(_ id: String) throws -> (bytes: Data, metadata: NSDictionary) {
    try storage.read { state in
      guard state["pendingAccountDeletion"] is NSNull else { throw CompanionError.accountDeletionPending }
      guard state["pendingPreviewClear"] is NSNull else { throw CompanionError.previewCleanupPending }
      let account = try identity(state)["accountId"] as! String, group = try family(state), peer = try peerId(group, account: account)
      guard grants(group, sender: peer, recipient: account).contains("photos"),
        let entry = (state["peerCategories"] as? [String: Any])?["photos"] as? [String: Any],
        let value = entry["value"] as? [String: Any],
        let metadata = (value["data"] as? [NSDictionary])?.first(where: {$0["id"] as? String == id}),
        let blob = (value["photoBytes"] as? [NSDictionary])?.first(where: {$0["id"] as? String == id}) else { throw CompanionError.notAuthorized }
      return (try CompanionCrypto.base64(blob["bytesBase64"]), metadata)
    }
  }
  private func validateInvite(_ value: [String: Any]) throws {
    guard let id = value["id"] as? String, CompanionCrypto.validId(id), let group = value["groupId"] as? String, CompanionCrypto.validId(group),
      ["family", "device"].contains(value["kind"] as? String ?? ""), ["open", "pending", "accepted", "cancelled"].contains(value["status"] as? String ?? ""),
      let creator = value["creatorId"] as? String, CompanionCrypto.validId(creator), let device = value["creatorDeviceId"] as? String, CompanionCrypto.validId(device),
      let wrapped = value["wrappedKey"] as? [String: Any], wrapped["algorithm"] as? String == "AES-256-GCM" else { throw CompanionError.invalidResponse }
    _ = try CompanionStateFile.integer(value["expiresAt"])
    for field in ["recipientId", "recipientDeviceId"] {
      guard value[field] is NSNull || (value[field] as? String).map(CompanionCrypto.validId) == true else { throw CompanionError.invalidResponse }
    }
    _ = try CompanionCrypto.base64(wrapped["nonce"], count: 12); _ = try CompanionCrypto.base64(wrapped["tag"], count: 16)
    _ = try CompanionCrypto.base64(wrapped["ciphertext"], count: 32)
  }
  private func applyGroup(_ group: [String: Any], state: inout [String: Any]) throws {
    let account = try identity(state)["accountId"] as! String
    guard let id = group["id"] as? String, CompanionCrypto.validId(id), let kind = group["kind"] as? String,
      ["family", "vault"].contains(kind), let members = group["members"] as? [String], Set(members).count == members.count,
      members.contains(account), members.allSatisfy(CompanionCrypto.validId), let _ = group["grants"] as? [String: Any] else { throw CompanionError.invalidResponse }
    _ = try CompanionStateFile.integer(group["epoch"])
    if kind == "family" {
      guard !((state["revokedFamilies"] as! [String: Any])[namespace(state, account: account)] as? [String] ?? []).contains(id) else { throw CompanionError.notAuthorized }
      guard members.count == 2 else { throw CompanionError.invalidResponse }
      let peer = try peerId(group, account: account), incoming = grants(group, sender: peer, recipient: account), outgoing = selectedGrants(group, state: state)
      guard incoming.allSatisfy(Self.categories.contains), outgoing.allSatisfy(Self.categories.contains) else { throw CompanionError.invalidResponse }
      var cache = state["peerCategories"] as! [String: Any]
      let revokedCategories = cache.keys.filter { !incoming.contains($0) }
      for category in revokedCategories { cache.removeValue(forKey: category) }
      if !revokedCategories.isEmpty { markPreviewClear("partner", state: &state) }
      state["peerCategories"] = cache
      let accountOutgoing = grants(group, sender: account, recipient: peer)
      if !incoming.contains("encouragement") || !accountOutgoing.contains("encouragement") {
        state["messages"] = [[String: Any]]()
      } else if !outgoing.contains("encouragement") {
        // Device-local default privacy stops incoming delivery; authenticated sender
        // history remains recoverable while the account's mutual grant still exists.
        state["messages"] = (state["messages"] as! [[String: Any]]).filter { $0["direction"] as? String == "outgoing" }
      }
      // Revoke pending writes as well as rendered caches; old ciphertext never retries after opt-out.
      var outbox = state["outbox"] as! [String: Any]
      outbox[id] = (outbox[id] as? [[String: Any]] ?? []).filter { change in
        guard let category = change["category"] as? String, outgoing.contains(category) else { return false }
        return category != "encouragement" || incoming.contains(category)
      }
      state["outbox"] = outbox
      var exports = state["familyExports"] as! [String: Any]
      for category in Self.categories where !outgoing.contains(category) { exports.removeValue(forKey: "family-" + id + "-" + category) }
      state["familyExports"] = exports
      if state["bindingCreatedAt"] is NSNull { state["bindingCreatedAt"] = timestamp(now()) }
    }
    var groups = state["groups"] as! [String: Any]; groups[id] = group; state["groups"] = groups
    if state["pendingPreviewClear"] is String {
      // All revoked categories, grants and pending writes are durable before cache I/O.
      try storage.write(state); try finishPreviewClear(&state)
    }
  }
  private func markPreviewClear(_ scope: String, state: inout [String: Any]) {
    if state["pendingPreviewClear"] as? String != "all" { state["pendingPreviewClear"] = scope }
  }
  private func persistPreviewRevocation(_ scope: String, state: inout [String: Any]) throws {
    markPreviewClear(scope, state: &state); try storage.write(state)
    try finishPreviewClear(&state)
  }
  private func finishPreviewClear(_ state: inout [String: Any]) throws {
    guard let scope = state["pendingPreviewClear"] as? String else { return }
    do { try data.clearPreviews(scope) }
    catch { throw CompanionError.previewCleanupPending }
    state["pendingPreviewClear"] = NSNull(); try storage.write(state)
    if errorCode == CompanionError.previewCleanupPending.code { errorCode = nil; syncState = "idle" }
  }
  private func clearFamily(_ state: inout [String: Any]) {
    if let family = familyOrNil(state), let id = family["id"] as? String {
      for field in ["groups", "outbox", "cursors", "acks"] {
        var values = state[field] as! [String: Any]; values.removeValue(forKey: id); state[field] = values
      }
    }
    state["familyKey"] = NSNull(); state["familyExports"] = [String: Any](); state["peerCategories"] = [String: Any](); state["messages"] = [[String: Any]](); state["bindingCreatedAt"] = NSNull()
  }
  private func finishLocalDeletion(_ state: inout [String: Any]) throws {
    guard state["pendingLocalDeletion"] as? Bool == true else { return }
    try data.deleteLocalData(); try persistPreviewRevocation("all", state: &state)
    state["pendingLocalDeletion"] = false; try storage.write(state); errorCode = nil; syncState = "idle"
  }
  private func clearSession(_ state: inout [String: Any]) {
    clearFamily(&state)
    state["identity"] = NSNull(); state["deviceAuthorized"] = false; state["groups"] = [String: Any](); state["invitations"] = [[String: Any]]()
    state["pendingInvites"] = [String: Any](); state["outbox"] = [String: Any](); state["cursors"] = [String: Any](); state["acks"] = [String: Any](); state["lastSyncAt"] = NSNull()
    state["lastVault"] = NSNull(); state["lastKeyring"] = NSNull(); state["selectedOutgoingCategories"] = [String: Any]()
    // Account-namespaced vault keys and local data ownership survive logout, never cross accounts.
  }
  private func clock(_ state: inout [String: Any]) throws -> CompanionMergeClock {
    let latest = try CompanionStateFile.integer(state["latestTimestamp"])
    guard latest < 9_007_199_254_740_991 else { throw CompanionError.invalidRequest }
    let value = max(Int64(now().timeIntervalSince1970 * 1000), latest + 1)
    state["latestTimestamp"] = value
    return CompanionMergeClock(updatedAt: value, deviceId: state["deviceId"] as! String, changeId: UUID().uuidString)
  }
  private func activeIdentity(_ state: [String: Any]) -> [String: Any]? {
    guard let value = state["identity"] as? [String: Any], let expires = value["expiresAt"] as? NSNumber,
      expires.doubleValue > now().timeIntervalSince1970 * 1000 else { return nil }; return value
  }
  private func identity(_ state: [String: Any]) throws -> [String: Any] { guard let identity = activeIdentity(state) else { throw CompanionError.notAuthenticated }; return identity }
  private func endpoint(_ state: [String: Any]) throws -> URL {
    guard let text = state["endpoint"] as? String, Self.validEndpoint(text), let url = URL(string: text) else { throw CompanionError.invalidRequest }; return url
  }
  static func validEndpoint(_ text: String) -> Bool {
    guard text.utf8.count <= 2048, let url = URLComponents(string: text), let host = url.host, !host.isEmpty,
      url.user == nil, url.password == nil, url.query == nil, url.fragment == nil, url.path.isEmpty || url.path == "/" else { return false }
    if url.rangeOfPort != nil && url.port == nil { return false }
    if text.hasSuffix(":") || text.hasSuffix(":/") { return false }
    if let port = url.port, !(1...65535).contains(port) { return false }
    if url.scheme?.lowercased() == "https" { return true }
    #if DEBUG
    return Bundle.main.bundleIdentifier == "com.zzzode.leanon.uiqa" && url.scheme?.lowercased() == "http" && ["127.0.0.1", "localhost", "::1", "[::1]"].contains(host)
    #else
    return false
    #endif
  }
  private func request(_ state: inout [String: Any], method: String, path: String, body: [String: Any]? = nil) throws -> [String: Any] {
    do { return try http.request(endpoint: endpoint(state), method: method, path: path, body: body, token: identity(state)["token"] as? String) }
    catch {
      if case CompanionError.http("unauthorized", _) = error {
        clearSession(&state); try persistPreviewRevocation("all", state: &state)
      }
      throw error
    }
  }
  private func vault(_ state: [String: Any]) throws -> [String: Any] {
    let id = try identity(state)["vaultId"] as! String
    guard let group = (state["groups"] as? [String: Any])?[id] as? [String: Any] else { throw CompanionError.invalidResponse }; return group
  }
  private func familyOrNil(_ state: [String: Any]) -> [String: Any]? { (state["groups"] as? [String: Any])?.values.compactMap {$0 as? [String: Any]}.first {$0["kind"] as? String == "family"} }
  private func family(_ state: [String: Any]) throws -> [String: Any] { guard let group = familyOrNil(state) else { throw CompanionError.notPaired }; return group }
  private func peerId(_ group: [String: Any], account: String) throws -> String {
    guard let members = group["members"] as? [String], members.count == 2, let peer = members.first(where: {$0 != account}) else { throw CompanionError.invalidResponse }; return peer
  }
  private func key(_ group: [String: Any], state: [String: Any]) throws -> Data {
    let account = try identity(state)["accountId"] as! String, groupId = group["id"] as! String
    let entry = group["kind"] as? String == "vault" ? (state["accountKeys"] as? [String: Any])?[namespace(state, account: account)] as? [String: Any] : state["familyKey"] as? [String: Any]
    guard let entry, (entry["vaultId"] ?? entry["groupId"]) as? String == groupId else { throw CompanionError.missingKey }
    if group["kind"] as? String == "family", entry["accountId"] as? String != account { throw CompanionError.notAuthorized }
    return try CompanionCrypto.base64(entry["key"], count: 32)
  }
  private func namespace(_ state: [String: Any], account: String) -> String {
    let realm = state["endpoint"] as? String ?? ""
    return SHA256.hash(data: Data(realm.utf8)).map { String(format: "%02x", $0) }.joined() + ":" + account
  }
  private func consentScope(_ group: [String: Any], state: [String: Any]) -> String {
    namespace(state, account: (state["identity"] as? [String: Any])?["accountId"] as? String ?? "") + ":" + (group["id"] as? String ?? "")
  }
  private func selectedGrants(_ group: [String: Any], state: [String: Any]) -> [String] {
    let account = (state["identity"] as? [String: Any])?["accountId"] as? String ?? ""
    let peer = (try? peerId(group, account: account)) ?? ""
    let remote = grants(group, sender: account, recipient: peer)
    let local = (state["selectedOutgoingCategories"] as? [String: Any])?[consentScope(group, state: state)] as? [String] ?? []
    return local.filter(remote.contains)
  }
  static func canonicalEndpoint(_ value: String) throws -> String {
    guard validEndpoint(value), var parts = URLComponents(string: value) else { throw CompanionError.invalidRequest }
    parts.scheme = parts.scheme?.lowercased(); parts.host = parts.host?.lowercased(); parts.path = ""
    if parts.scheme == "https" && parts.port == 443 || parts.scheme == "http" && parts.port == 80 { parts.port = nil }
    guard let text = parts.string else { throw CompanionError.invalidRequest }; return text
  }
  private func grants(_ group: [String: Any], sender: String, recipient: String) -> [String] { ((group["grants"] as? [String: Any])?[sender] as? [String: Any])?[recipient] as? [String] ?? [] }
  private func parameterId(_ params: [String: Any]) throws -> String { guard let id = params["id"] as? String, CompanionCrypto.validId(id) else { throw CompanionError.invalidRequest }; return id }
  private func timestamp(_ date: Date) -> String { let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return formatter.string(from: date) }
  private func parseDate(_ value: String) -> Date? { let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; if let date = formatter.date(from: value) { return date }; formatter.formatOptions = [.withInternetDateTime]; return formatter.date(from: value) }
}
