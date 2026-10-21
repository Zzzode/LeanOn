package com.zzzode.leanon.companion

import android.app.Instrumentation
import android.content.Context
import android.content.ContextWrapper
import com.zzzode.leanon.LeanOnApplication
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Prepares only a fresh .uiqa app on a dedicated emulator; all services are loopback fixtures. */
internal object MigrationEntryFixture {
  const val password = "PUBLIC fictional migration password 2026"
  const val backupPassword = "PUBLIC encrypted cutover backup 2026"
  fun canonical(value: Any?): String = when (value) {
    is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(prefix="{",postfix="}") { JSONObject.quote(it)+":"+canonical(value.get(it)) }
    is JSONArray -> (0 until value.length()).joinToString(prefix="[",postfix="]") { canonical(value.get(it)) }
    is String -> JSONObject.quote(value)
    null, JSONObject.NULL -> "null"
    else -> value.toString()
  }
  fun health(value: JSONObject): String {
    val copy=JSONObject(value.toString());copy.remove("createdAt")
    copy.getJSONObject("records").remove("revision");copy.getJSONObject("personal").remove("revision")
    return canonical(copy)
  }
  fun seed(instrumentation: Instrumentation) {
    val context=instrumentation.targetContext;val app=context.applicationContext as LeanOnApplication
    check(context.packageName=="com.zzzode.leanon.uiqa")
    val store=SecureCompanionStore(context)
    check(store.read()?.optJSONObject("session")==null) { "Never overwrite an existing account" }
    check(app.records.currentSnapshot().getJSONArray("weights").length()==0) { "Fresh QA app required" }
    val vector=JSONObject(instrumentation.context.assets.open("public-backup-v1.json").bufferedReader().use { it.readText() })
    fun restore(backup: com.zzzode.leanon.personal.BackupCoordinator) {
      val preview=backup.inspect(vector.getJSONObject("envelope").toString().toByteArray(),vector.getString("password"))
      backup.restore(preview.getString("token"),preview.getLong("expectedRecordsRevision"),preview.getLong("expectedPersonalRevision"))
    }
    app.companion.configure("http://10.0.2.2:64041");app.companion.register("migration-owner",password);restore(app.backup)
    app.records.addWeight("2026-10-06",80.6);app.records.addWeight("2026-10-07",80.4)
    app.records.upsertWater("2026-10-07",750.0);app.records.addExercise("2026-10-07","walking",20.0,80.0)
    app.records.addIntake("2026-10-07",140.0,12.0,1.0,9.0)
    app.companion.attachLocalData(app.records.currentSnapshot().getLong("revision"),app.personal.snapshot().getLong("revision"));app.companion.sync()
    val peerContext=object: ContextWrapper(context) {
      override fun getFilesDir()=File(context.cacheDir,"migration-entry-peer").apply { mkdirs() }
      override fun getCacheDir()=File(filesDir,"cache").apply { mkdirs() }
      override fun getPackageName()=context.packageName+".migration-entry-peer"
      override fun getApplicationContext(): Context=this
    }
    val peer=CompanionMigrationCollection(peerContext);val service=peer.service()
    service.configure("http://10.0.2.2:64041");service.register("migration-partner",password);restore(peer.backup)
    service.attachLocalData(peer.records.currentSnapshot().getLong("revision"),peer.personal.snapshot().getLong("revision"));service.sync()
    CompanionHttp("http://10.0.2.2:64042").request("POST","/v1/prepare",JSONObject())
    File(context.cacheDir,"migration-entry-source-health.json").writeText(health(app.backup.exportPayload()))
    check(app.migration.state().getJSONObject("migration").getString("phase")=="idle")
  }
  fun verify(context: Context): JSONObject {
    val app=context.applicationContext as LeanOnApplication
    check(context.packageName=="com.zzzode.leanon.uiqa")
    val state=app.migration.state().getJSONObject("migration");val phase=state.getString("phase")
    val before=File(context.cacheDir,"migration-entry-source-health.json").readText()
    check(health(app.backup.exportPayload())==before) { "Actual local health or original photo bytes changed" }
    if(phase=="active") {
      check(app.migration.start("repeat-original-confirmation",password,backupPassword,true).getJSONObject("migration").getString("phase")=="active")
      check(app.migration.resume(password,backupPassword,true).getJSONObject("migration").getString("phase")=="active")
    }
    if(phase=="rolled-back")check(app.migration.rollback(true).getJSONObject("migration").getString("phase")=="rolled-back")
    val journal=CompanionCutoverJournal(context).read()
    if(phase in listOf("active","rolled-back","paused"))check(journal!=null)
    return JSONObject().put("phase",phase).put("healthAndOriginalPhotosPreserved",true).put("repeatActionIdempotent",phase in listOf("active","rolled-back")).put("encryptedSourceJournalRetained",journal!=null)
  }
}
