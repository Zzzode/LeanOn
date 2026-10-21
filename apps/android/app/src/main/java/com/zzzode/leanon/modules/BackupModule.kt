package com.zzzode.leanon.modules

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.react.bridge.ReadableMap
import com.zzzode.leanon.LeanOnApplication
import com.zzzode.leanon.data.toJavaOnlyMap
import com.zzzode.leanon.personal.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.IOException
import java.time.LocalDate

/** SAF document delivery is acknowledged only after the selected destination is written and closed. */
class BackupModule(context: Context) : LynxModule(context) {
  private val moduleContext = context
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val main = Handler(Looper.getMainLooper())
  private fun app() = nativeModuleContext(moduleContext).applicationContext as LeanOnApplication
  private fun failure(error: Exception) = JavaOnlyMap().apply {
    putString("code", when(error) { is PersonalFailure -> error.code; is org.json.JSONException, is InvalidRecordRequest -> "invalid-request"; else -> "unavailable" })
    putString("message", if (error is PersonalFailure) error.message else "Backup operation is unavailable")
  }
  private fun password(params: ReadableMap): String {
    val json = readableJson(params); personalKeys(json, listOf("password"))
    return BackupCodec.password(json.opt("password") as? String ?: personalInvalid("Missing passphrase"))
  }
  @LynxMethod fun export(params: ReadableMap, callback: Callback) {
    val secret = try { password(params) } catch (error: Exception) { callback.invoke(failure(error)); return }
    scope.launch {
      val bytes = try { BackupCodec.seal(app().backup.exportPayload(), secret) } catch (error: Exception) { callback.invoke(failure(error)); return@launch }
      val fileName = "leanon-${LocalDate.now(app().recordClock())}.leanon-backup.json"
      main.post {
        val host = nativeModuleActivity(moduleContext)
        if (host == null) { bytes.fill(0); callback.invoke(failure(IOException("Host unavailable"))); return@post }
        if (!PersonalDocuments.launch(host, image = false, exportName = fileName) { selected ->
          when(selected) {
            DocumentSelection.Cancelled -> { bytes.fill(0); callback.invoke(JSONObject().put("cancelled", true).toJavaOnlyMap()) }
            DocumentSelection.Unavailable -> { bytes.fill(0); callback.invoke(failure(IOException("Document picker unavailable"))) }
            is DocumentSelection.Selected -> scope.launch {
              val result = try {
                val descriptor = app().contentResolver.openFileDescriptor(selected.uri, "wt") ?: throw IOException("Destination unavailable")
                android.os.ParcelFileDescriptor.AutoCloseOutputStream(descriptor).use { output -> output.write(bytes); output.flush(); descriptor.fileDescriptor.sync() }
                JSONObject().put("cancelled", false).put("fileName", fileName).toJavaOnlyMap()
              } catch (error: Exception) { failure(error) } finally { bytes.fill(0) }
              callback.invoke(result)
            }
          }
        }) { bytes.fill(0); callback.invoke(failure(IOException("Another document picker is pending"))) }
      }
    }
  }
  @LynxMethod fun inspectImport(params: ReadableMap, callback: Callback) {
    val secret = try { password(params) } catch (error: Exception) { callback.invoke(failure(error)); return }
    main.post {
      val host = nativeModuleActivity(moduleContext)
      if (host == null) { callback.invoke(failure(IOException("Host unavailable"))); return@post }
      if (!PersonalDocuments.launch(host, image = false) { selected ->
        when(selected) {
          DocumentSelection.Cancelled -> callback.invoke(JSONObject().put("cancelled", true).toJavaOnlyMap())
          DocumentSelection.Unavailable -> callback.invoke(failure(IOException("Document picker unavailable")))
          is DocumentSelection.Selected -> scope.launch {
            val result = try {
              val bytes = app().contentResolver.openInputStream(selected.uri)?.use { readPersonalBytes(it, BackupCodec.MAX_FILE_BYTES) } ?: throw IOException("Backup unavailable")
              try { app().backup.inspect(bytes, secret).toJavaOnlyMap() } finally { bytes.fill(0) }
            } catch (error: Exception) { failure(error) }
            callback.invoke(result)
          }
        }
      }) callback.invoke(failure(IOException("Another document picker is pending")))
    }
  }
  @LynxMethod fun restore(params: ReadableMap, callback: Callback) {
    val request = try {
      val value = readableJson(params); personalKeys(value, listOf("token", "expectedRecordsRevision", "expectedPersonalRevision"))
      Triple(personalId(value.opt("token")), personalRevision(value.opt("expectedRecordsRevision")), personalRevision(value.opt("expectedPersonalRevision")))
    } catch (error: Exception) { callback.invoke(failure(error)); return }
    scope.launch {
      val result = try {
        val response = app().backup.restore(request.first, request.second, request.third)
        app().clearPersonalPreviews()
        app().events.dispatch("records.changed", JSONObject().put("hostData", response.getJSONObject("hostData")).toJavaOnlyMap())
        app().events.dispatch("personal.changed", JSONObject().put("personal", response.getJSONObject("personal")).toJavaOnlyMap())
        response.toJavaOnlyMap()
      } catch (error: Exception) { failure(error) }
      callback.invoke(result)
    }
  }
}
