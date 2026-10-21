package com.zzzode.leanon.companion

import android.content.Context
import com.zzzode.leanon.data.writeRecordsAtomically
import com.zzzode.leanon.personal.*
import org.json.JSONObject
import java.io.File
import java.util.UUID

/** Native Settings authority. No password/key is returned to the bridge or kept in a plaintext plan. */
internal class CompanionMigrationController(context: Context, private val sourceStore: CompanionStore,
  private val backup: BackupCoordinator, private val source: () -> CompanionRepository,
  private val target: CompanionMigrationCollection = CompanionMigrationCollection(context), private val adopted: () -> Unit = {}) {
  private val directory = File(context.filesDir,"companion-migration-ui")
  private val file = File(directory,"state.enc")
  private val keys = PersonalKeyStore(context,directory,"companion-migration-ui")
  private val journal = CompanionCutoverJournal(context)
  private val control = Any()
  private var running = false
  private var pauseRequested = false
  var changed: ((JSONObject) -> Unit)? = null
  private fun read(): JSONObject = synchronized(control) {
    if (!file.exists()) JSONObject().put("phase","idle")
    else JSONObject(String(PersonalCrypto.localOpen(keys.key(false),file.readText(),"companion-migration-ui"),Charsets.UTF_8))
  }
  private fun save(value: JSONObject) = synchronized(control) {
    val bytes = value.toString().toByteArray()
    try { writeRecordsAtomically(file,PersonalCrypto.localEnvelope(keys.key(true),bytes,"companion-migration-ui")) } finally { bytes.fill(0) }
    changed?.invoke(projection(value))
  }
  private fun projection(value: JSONObject): JSONObject {
    val state = JSONObject().put("phase",value.optString("phase","idle"))
    for (field in listOf("sourceEndpoint","targetEndpoint","targetServiceId","accountId","accountName","operationId","previewToken","errorCode")) state.put(field,value.opt(field) ?: JSONObject.NULL)
    state.put("counts",value.optJSONObject("counts") ?: JSONObject().apply { for (field in listOf("weights","water","exercises","meals","measurements","photos"))put(field,0) })
    return JSONObject().put("migration",state)
  }
  fun state(): JSONObject = synchronized(control) {
    val value = read(); val own = sourceStore.read()
    if(value.optString("phase")=="idle" && own?.optJSONObject("session") != null) value.put("sourceEndpoint",own.opt("endpoint")).put("accountId",own.getJSONObject("session").opt("accountId")).put("accountName",own.getJSONObject("session").opt("login"))
    if (own?.optJSONObject("session")?.optString("accountId") == value.optString("accountId") && own.optString("endpoint") == value.optString("targetEndpoint") && value.optString("phase") in listOf("activating","paused","publishing","prepared")) { value.put("phase","active"); save(value) }
    if (own?.optString("endpoint") == value.optString("sourceEndpoint") && value.optString("phase") == "active") { value.put("phase","rolled-back"); save(value) }
    if (!running && value.optString("phase") in listOf("preparing","restoring","publishing","activating","pausing")) { value.put("phase","paused"); save(value) }
    projection(value)
  }
  private fun serviceIdentity(endpoint: String): String {
    val value = CompanionHttp(endpoint).request("GET","/v2/service")
    val id = value.optString("serviceId")
    if (value.optInt("protocol") != 2 || !id.matches(Regex("[a-f0-9]{64}"))) throw CompanionFailure("invalid-response","Target service identity is invalid")
    return id
  }
  @Synchronized fun preview(endpoint: String, password: String): JSONObject {
    val targetEndpoint = CompanionHttp.validateEndpoint(endpoint)
    check(!running && read().optString("phase") in listOf("idle","review","rolled-back"))
    source().getState(); val own = sourceStore.read() ?: throw CompanionFailure("not-authorized","Sign in first")
    val identity = own.optJSONObject("session") ?: throw CompanionFailure("not-authorized","Sign in first")
    if (!identity.getBoolean("deviceAuthorized") || own.optString("localDataAccountId") != identity.getString("accountId") || !own.isNull("pendingAccountDeletion") || own.getString("endpoint") == targetEndpoint) throw CompanionFailure("not-authorized","Approved attached source required")
    val service = serviceIdentity(targetEndpoint); val http = CompanionHttp(targetEndpoint)
    val session = http.request("POST","/v1/sessions",JSONObject().put("login",identity.getString("login")).put("password",password).put("deviceId",own.get("deviceId")).put("deviceProof",own.get("deviceProof")))
    val token = session.getString("token")
    try {
      val me = http.request("GET","/v1/me",token=token)
      if (!session.getBoolean("deviceAuthorized") || session.getString("accountId") != identity.getString("accountId") || session.getString("vaultId") != identity.getString("vaultId") || me.optJSONObject("migration") == null) throw CompanionFailure("not-authorized","Staged account identity does not match source")
      val operation = me.getJSONObject("migration").getString("id"); check(operation.matches(Regex("[A-Za-z0-9_-]{1,128}")))
      val payload = backup.exportPayload(); val records = payload.getJSONObject("records"); val personal = payload.getJSONObject("personal")
      val counts = JSONObject().put("weights",records.getJSONArray("weights").length()).put("water",records.getJSONArray("water").length()).put("exercises",records.getJSONArray("exercises").length()).put("meals",records.getJSONArray("intakeEntries").length()+records.getJSONArray("legacyIntake").length()).put("measurements",personal.getJSONArray("measurements").length()).put("photos",personal.getJSONArray("photos").length())
      val value = JSONObject().put("phase","review").put("sourceEndpoint",own.getString("endpoint")).put("targetEndpoint",targetEndpoint).put("targetServiceId",service).put("accountId",identity.getString("accountId")).put("accountName",identity.getString("login")).put("operationId",operation).put("previewToken",UUID.randomUUID().toString()).put("expiresAt",System.currentTimeMillis()+600000).put("recordsRevision",records.getLong("revision")).put("personalRevision",personal.getLong("revision")).put("counts",counts)
      save(value); return projection(value)
    } finally { runCatching { http.request("DELETE","/v1/sessions/current",token=token) } }
  }
  @Synchronized fun start(token: String, password: String, backupPassword: String, consent: Boolean): JSONObject {
    state(); val value = read()
    if(consent && value.optString("phase")=="active")return projection(value)
    if (!consent || value.optString("phase") != "review" || value.optString("previewToken") != token || value.optLong("expiresAt") <= System.currentTimeMillis()) throw CompanionFailure("conflict","Migration preview expired")
    val payload = backup.exportPayload()
    if (payload.getJSONObject("records").getLong("revision") != value.getLong("recordsRevision") || payload.getJSONObject("personal").getLong("revision") != value.getLong("personalRevision")) throw CompanionFailure("conflict","Migration preview changed")
    if (serviceIdentity(value.getString("targetEndpoint")) != value.getString("targetServiceId")) throw CompanionFailure("not-authorized","Target identity changed")
    synchronized(control) { running=true; pauseRequested=false; value.put("phase","preparing"); save(value) }
    try {
      CompanionCloudflareMigration.prepare(source(),sourceStore,backup,journal,value.getString("targetEndpoint"),value.getString("operationId"),backupPassword)
      val paused = synchronized(control) { value.put("phase",if(pauseRequested)"paused" else "prepared").put("previewToken",JSONObject.NULL);save(value);pauseRequested }
      return if(paused)projection(value) else resume(password,backupPassword,consent)
    } catch(error: Exception) { value.put("phase","paused").put("errorCode",if(error is CompanionFailure)error.code else "unavailable");save(value);throw error }
    finally { adopted(); synchronized(control) { running=false } }
  }
  @Synchronized fun resume(password: String, backupPassword: String, consent: Boolean): JSONObject {
    val value = read(); if(value.optString("phase") == "active")return projection(value)
    if(!consent || value.optString("phase") !in listOf("prepared","paused"))throw CompanionFailure("invalid-request","No resumable migration")
    val own = sourceStore.read() ?: throw CompanionFailure("not-authorized","Source state missing")
    if(own.optString("endpoint") != value.getString("sourceEndpoint") || own.optJSONObject("session")?.optString("accountId") != value.getString("accountId") || !own.isNull("pendingAccountDeletion") || serviceIdentity(value.getString("targetEndpoint")) != value.getString("targetServiceId"))throw CompanionFailure("not-authorized","Migration identity changed")
    synchronized(control) { if(!running)pauseRequested=false;running=true;value.put("phase","publishing").put("errorCode",JSONObject.NULL);save(value) }
    try {
      if(journal.read() == null)CompanionCloudflareMigration.prepare(source(),sourceStore,backup,journal,value.getString("targetEndpoint"),value.getString("operationId"),backupPassword)
      CompanionCloudflareMigration.publish(journal,target.store,target.backup,target::service,password,backupPassword)
      if(synchronized(control){pauseRequested}){value.put("phase","paused");save(value);return projection(value)}
      target.service().sync()
      if(serviceIdentity(value.getString("targetEndpoint")) != value.getString("targetServiceId"))throw CompanionFailure("not-authorized","Target identity changed")
      synchronized(control) {
        if(pauseRequested){value.put("phase","paused");save(value);return projection(value)}
        value.put("phase","activating");save(value)
        val local=backup.exportPayload();val remote=target.backup.exportPayload();val old=sourceStore.read()!!;val next=target.store.read()!!
        val oldKey=old.getString("endpoint")+"#"+value.getString("accountId");val nextKey=next.getString("endpoint")+"#"+value.getString("accountId")
        val wireA=CompanionVaultMerge.prepare(local,old.getJSONObject("vaultMetadata").optJSONObject(oldKey),old.getString("deviceId"),System.currentTimeMillis())
        val wireB=CompanionVaultMerge.prepare(remote,next.getJSONObject("vaultMetadata").optJSONObject(nextKey),next.getString("deviceId"),System.currentTimeMillis())
        val merged=CompanionVaultMerge.merge(wireA,wireB)
        next.getJSONObject("vaultMetadata").put(nextKey,CompanionVaultMerge.metadata(merged))
        backup.mergeVaultPayload(merged.getJSONObject("payload"),sourceStore.prepare(next){adopted()},local.getJSONObject("records").getLong("revision"),local.getJSONObject("personal").getLong("revision"))
        value.put("phase","active");save(value);return projection(value)
      }
    } catch(error: Exception){value.put("phase","paused").put("errorCode",if(error is CompanionFailure)error.code else "unavailable");save(value);throw error}
    finally { adopted(); synchronized(control){running=false} }
  }
  fun pause(): JSONObject = synchronized(control) {
    val value=read()
    if(running){pauseRequested=true;value.put("phase","pausing")}
    else if(value.optString("phase") in listOf("review","prepared","paused"))value.put("phase",if(value.optString("phase")=="review")"idle" else "paused").put("previewToken",JSONObject.NULL)
    save(value);projection(value)
  }
  @Synchronized fun rollback(consent: Boolean): JSONObject {
    val value=read();if(value.optString("phase")=="rolled-back")return projection(value)
    if(!consent || running || value.optString("phase")!="active")throw CompanionFailure("invalid-request","Rollback requires explicit confirmation")
    val own=sourceStore.read() ?: throw CompanionFailure("not-authorized","Current state unavailable")
    if(own.optString("endpoint") != value.getString("targetEndpoint") || own.optJSONObject("session")?.optString("accountId") != value.getString("accountId") || !own.isNull("pendingAccountDeletion"))throw CompanionFailure("not-authorized","Current account changed")
    val old=journal.read()?.getJSONObject("sourceState") ?: throw CompanionFailure("unavailable","Encrypted source journal unavailable")
    sourceStore.write(old);adopted();value.put("phase","rolled-back").put("errorCode",JSONObject.NULL);save(value);return projection(value)
  }
}
