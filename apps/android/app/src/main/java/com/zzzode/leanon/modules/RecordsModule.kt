package com.zzzode.leanon.modules

import android.content.Context
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.react.bridge.ReadableMap
import com.lynx.react.bridge.ReadableArray
import com.lynx.react.bridge.ReadableType
import com.lynx.tasm.behavior.LynxContext
import com.zzzode.leanon.LeanOnApplication
import com.zzzode.leanon.data.RecordsFailure
import com.zzzode.leanon.data.toJavaOnlyMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.json.JSONArray

/** Revisioned native transaction authority for daily record editing. */
class RecordsModule(context: Context) : LynxModule(context) {
  private val moduleContext = context
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private fun app() = ((moduleContext as? LynxContext)?.getContext() ?: moduleContext).applicationContext as LeanOnApplication

  @LynxMethod
  @Suppress("UNUSED_PARAMETER")
  fun getSnapshot(params: ReadableMap?, callback: Callback) {
    scope.launch {
      val result = try { JSONObject().put("hostData", app().records.currentSnapshot()).toJavaOnlyMap() }
      catch (_: Exception) { failure("unavailable", "Unable to read saved records") }
      callback.invoke(result)
    }
  }

  @LynxMethod
  fun mutate(params: ReadableMap, callback: Callback) {
    val request = try {
      decodeRecordsRequest(params)
    } catch (error: Exception) {
      callback.invoke(failure("invalid-request", error.message ?: "Invalid record mutation")); return
    }
    scope.launch {
      val result = try {
        val application = app()
        val response = application.records.mutate(request.first, request.second, request.third)
        if (!response.getBoolean("replayed")) {
          runCatching { application.events.dispatch("records.changed", JSONObject().put("hostData", response.getJSONObject("hostData")).toJavaOnlyMap()) }
            .onFailure { android.util.Log.w("LeanOn", "Saved records event delivery failed", it) }
          application.healthConnect.onRecordsChanged()
          if (request.third.optString("type") == "delete-record" && request.third.optString("kind") == "exercise") {
            application.healthConnect.deleteExerciseSessionAsync(request.third.getString("id"))
          }
        }
        response.toJavaOnlyMap()
      } catch (error: RecordsFailure) { failure(error.code, error.message ?: "Record mutation failed") }
      catch (_: Exception) { failure("unavailable", "Unable to save records") }
      callback.invoke(result)
    }
  }

  private fun failure(code: String, message: String) = JavaOnlyMap().apply { putString("code", code); putString("message", message) }
}

internal fun readableJson(value: ReadableMap): JSONObject {
  val result = JSONObject(); val keys = value.keySetIterator()
  while (keys.hasNextKey()) {
    val key = keys.nextKey()
    result.put(key, when (value.getType(key)) {
      ReadableType.Null -> JSONObject.NULL
      ReadableType.Boolean -> value.getBoolean(key)
      ReadableType.String -> value.getString(key)
      ReadableType.Number, ReadableType.Int, ReadableType.Long -> value.getDouble(key)
      ReadableType.Map -> readableJson(value.getMap(key) ?: throw InvalidRecordRequest("Invalid map"))
      ReadableType.Array -> readableJsonArray(value.getArray(key) ?: throw InvalidRecordRequest("Invalid array"))
      else -> throw InvalidRecordRequest("Unsupported value")
    })
  }
  return result
}
private fun readableJsonArray(value: ReadableArray): JSONArray {
  val result = JSONArray()
  for (i in 0 until value.size()) result.put(when (value.getType(i)) {
    ReadableType.Null -> JSONObject.NULL
    ReadableType.Boolean -> value.getBoolean(i)
    ReadableType.String -> value.getString(i)
    ReadableType.Number, ReadableType.Int, ReadableType.Long -> value.getDouble(i)
    ReadableType.Map -> readableJson(value.getMap(i) ?: throw InvalidRecordRequest("Invalid map"))
    ReadableType.Array -> readableJsonArray(value.getArray(i) ?: throw InvalidRecordRequest("Invalid array"))
    else -> throw InvalidRecordRequest("Unsupported value")
  })
  return result
}

/** Private JSON wire preserves explicit nulls that Lynx otherwise omits from map arguments. */
internal fun decodeRecordsRequest(params: ReadableMap): Triple<String, Long, JSONObject> {
  val value = if (params.hasKey("__leanonRecordsRequestJSON")) {
    val keys = params.keySetIterator()
    var count = 0
    while (keys.hasNextKey()) { keys.nextKey(); count += 1 }
    if (count != 1) throw InvalidRecordRequest("Mixed records request envelope")
    JSONObject(RecordRequest.string(params, "__leanonRecordsRequestJSON"))
  } else readableJson(params)
  val id = value.opt("operationId") as? String ?: throw InvalidRecordRequest("Invalid operationId")
  if (id.isBlank() || id.trim() != id) throw InvalidRecordRequest("Invalid operationId")
  val revision = (value.opt("expectedRevision") as? Number)?.toDouble() ?: throw InvalidRecordRequest("Invalid revision")
  if (!revision.isFinite() || revision < 0 || revision % 1.0 != 0.0 || revision > 9007199254740991.0) throw InvalidRecordRequest("Invalid revision")
  return Triple(id, revision.toLong(), value.optJSONObject("mutation") ?: throw InvalidRecordRequest("Invalid mutation"))
}
