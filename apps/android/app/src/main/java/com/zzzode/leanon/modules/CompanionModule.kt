package com.zzzode.leanon.modules

import android.content.Context
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.react.bridge.ReadableMap
import com.zzzode.leanon.LeanOnApplication
import com.zzzode.leanon.companion.CompanionFailure
import com.zzzode.leanon.data.toJavaOnlyMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject

class CompanionModule(context: Context) : LynxModule(context) {
  private val moduleContext = context
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private fun app() = nativeModuleContext(moduleContext).applicationContext as LeanOnApplication
  private fun run(callback: Callback, invalidatePlans: Boolean = true, clearAllPreviews: Boolean = false, action: () -> JSONObject) {
    scope.launch {
      val response = try {
        val result = synchronized(app().companionOperationLock) { action() }
        if (invalidatePlans) app().backup.invalidatePlans()
        if (clearAllPreviews) app().clearPersonalPreviews()
        app().events.dispatch("companion.changed", JSONObject().put("companion", result.getJSONObject("companion")).put("runtime", result.getJSONObject("runtime")).toJavaOnlyMap())
        if (result.has("hostData")) app().events.dispatch("records.changed", JSONObject().put("hostData", result.getJSONObject("hostData")).toJavaOnlyMap())
        if (result.has("personal")) app().events.dispatch("personal.changed", JSONObject().put("personal", result.getJSONObject("personal")).toJavaOnlyMap())
        result.toJavaOnlyMap()
      } catch (error: Exception) {
        val code = if (error is CompanionFailure) error.code else "unavailable"
        runCatching { app().companion.recordFailure(code) }
        JavaOnlyMap().apply { putString("code", code); putString("message", if (error is CompanionFailure) error.message else "Companion service is unavailable") }
      }
      callback.invoke(response)
    }
  }
  private fun request(params: ReadableMap, allowed: Set<String>): JSONObject = readableJson(params).also { if (it.keys().asSequence().any { key -> key !in allowed }) throw CompanionFailure("invalid-request", "Invalid companion request") }
  private fun text(value: JSONObject, key: String): String = (value.opt(key) as? String) ?: throw CompanionFailure("invalid-request", "Invalid $key")
  private fun revision(value: JSONObject, key: String): Long {
    val raw = (value.opt(key) as? Number)?.toDouble() ?: throw CompanionFailure("invalid-request", "Invalid revision")
    if (!raw.isFinite() || raw < 0 || raw > 9007199254740991.0 || raw % 1.0 != 0.0) throw CompanionFailure("invalid-request", "Invalid revision")
    return raw.toLong()
  }
  private fun migrationRun(callback: Callback, concurrent: Boolean = false, changed: Boolean = false, action: () -> JSONObject) {
    scope.launch {
      val response = try {
        val result = if(concurrent)action() else synchronized(app().companionOperationLock){action()}
        if(changed) {
          app().backup.invalidatePlans(); app().clearPersonalPreviews()
          app().events.dispatch("records.changed",JSONObject().put("hostData",app().records.currentSnapshot()).toJavaOnlyMap())
          app().events.dispatch("personal.changed",JSONObject().put("personal",app().personal.snapshot()).toJavaOnlyMap())
          val state=app().companion.getState();app().events.dispatch("companion.changed",state.toJavaOnlyMap())
        }
        result
      } catch(error: Exception) { JSONObject().put("code",if(error is CompanionFailure)error.code else "unavailable").put("message","Migration operation could not be completed").put("retriable",true) }
      callback.invoke(response.toJavaOnlyMap())
    }
  }
  @LynxMethod @Suppress("UNUSED_PARAMETER") fun getMigrationState(params: ReadableMap?, callback: Callback) = migrationRun(callback,concurrent=true){app().migration.state()}
  @LynxMethod fun previewMigration(params: ReadableMap, callback: Callback) = migrationRun(callback){val v=request(params,setOf("targetEndpoint","password"));app().migration.preview(text(v,"targetEndpoint"),text(v,"password"))}
  @LynxMethod fun startMigration(params: ReadableMap, callback: Callback) = migrationRun(callback,changed=true){val v=request(params,setOf("previewToken","password","backupPassword","consent"));app().migration.start(text(v,"previewToken"),text(v,"password"),text(v,"backupPassword"),v.opt("consent")==true)}
  @LynxMethod fun resumeMigration(params: ReadableMap, callback: Callback) = migrationRun(callback,changed=true){val v=request(params,setOf("password","backupPassword","consent"));app().migration.resume(text(v,"password"),text(v,"backupPassword"),v.opt("consent")==true)}
  @LynxMethod @Suppress("UNUSED_PARAMETER") fun pauseMigration(params: ReadableMap?, callback: Callback) = migrationRun(callback,concurrent=true){app().migration.pause()}
  @LynxMethod fun rollbackMigration(params: ReadableMap, callback: Callback) = migrationRun(callback,changed=true){val v=request(params,setOf("consent"));app().migration.rollback(v.opt("consent")==true)}
  @LynxMethod @Suppress("UNUSED_PARAMETER") fun getState(params: ReadableMap?, callback: Callback) = run(callback, false) { app().companion.getState() }
  @LynxMethod fun configure(params: ReadableMap, callback: Callback) = run(callback) { val value = request(params, setOf("endpoint")); app().companion.configure(text(value, "endpoint")) }
  @LynxMethod fun register(params: ReadableMap, callback: Callback) = run(callback) { val value = request(params, setOf("login", "password", "admissionToken")); app().companion.register(text(value, "login"), text(value, "password"), if (value.has("admissionToken")) text(value, "admissionToken") else null) }
  @LynxMethod fun login(params: ReadableMap, callback: Callback) = run(callback) { val value = request(params, setOf("login", "password")); app().companion.login(text(value, "login"), text(value, "password")) }
  @LynxMethod @Suppress("UNUSED_PARAMETER") fun logout(params: ReadableMap?, callback: Callback) = run(callback) { app().companion.logout() }
  @LynxMethod fun attachLocalData(params: ReadableMap, callback: Callback) = run(callback) { val value = request(params, setOf("expectedRecordsRevision", "expectedPersonalRevision")); app().companion.attachLocalData(revision(value, "expectedRecordsRevision"), revision(value, "expectedPersonalRevision")) }
  @LynxMethod fun deleteAccount(params: ReadableMap, callback: Callback) = run(callback, clearAllPreviews = true) { val value = request(params, setOf("password", "deleteLocalData")); val delete = value.opt("deleteLocalData") as? Boolean ?: throw CompanionFailure("invalid-request", "Invalid deletion choice"); app().companion.deleteAccount(text(value, "password"), delete) }
  @LynxMethod fun confirmAccountDeletionLocalData(params: ReadableMap, callback: Callback) = run(callback, clearAllPreviews = true) { val value = request(params, setOf("deleteLocalData", "expectedRecordsRevision", "expectedPersonalRevision")); val delete = value.opt("deleteLocalData") as? Boolean ?: throw CompanionFailure("invalid-request", "Invalid deletion choice"); app().companion.confirmAccountDeletionLocalData(delete, revision(value, "expectedRecordsRevision"), revision(value, "expectedPersonalRevision")) }
  @LynxMethod fun createInvitation(params: ReadableMap, callback: Callback) = run(callback) { val value = request(params, setOf("kind")); app().companion.createInvitation(text(value, "kind")) }
  @LynxMethod fun acceptInvitation(params: ReadableMap, callback: Callback) = run(callback) { val value = request(params, setOf("code")); app().companion.acceptInvitation(text(value, "code")) }
  @LynxMethod fun confirmInvitation(params: ReadableMap, callback: Callback) = run(callback) { val value = request(params, setOf("id")); app().companion.confirmInvitation(text(value, "id")) }
  @LynxMethod fun cancelInvitation(params: ReadableMap, callback: Callback) = run(callback) { val value = request(params, setOf("id")); app().companion.cancelInvitation(text(value, "id")) }
  @LynxMethod fun setSharing(params: ReadableMap, callback: Callback) = run(callback) { val value = request(params, setOf("categories")); val categories = value.optJSONArray("categories") ?: throw CompanionFailure("invalid-request", "Invalid sharing choice"); app().companion.setSharing((0 until categories.length()).map { categories.get(it) as? String ?: throw CompanionFailure("invalid-request", "Invalid sharing choice") }) }
  @LynxMethod @Suppress("UNUSED_PARAMETER") fun sync(params: ReadableMap?, callback: Callback) = run(callback) { app().companion.sync() }
  @LynxMethod fun sendEncouragement(params: ReadableMap, callback: Callback) = run(callback) { val value = request(params, setOf("text")); app().companion.sendEncouragement(text(value, "text")) }
  @LynxMethod fun unlink(params: ReadableMap, callback: Callback) = run(callback) { val value = request(params, setOf("deletePeerCache")); if (value.opt("deletePeerCache") != true) throw CompanionFailure("invalid-request", "Peer cache deletion is required"); app().companion.unlink() }
}
