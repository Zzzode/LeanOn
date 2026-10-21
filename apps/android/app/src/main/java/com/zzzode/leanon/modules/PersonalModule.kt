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
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.time.LocalDate
import java.time.Instant
import java.security.MessageDigest

class PersonalModule(context: Context) : LynxModule(context) {
  private val moduleContext = context
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val main = Handler(Looper.getMainLooper())
  private fun app() = nativeModuleContext(moduleContext).applicationContext as LeanOnApplication
  private fun failure(error: Exception) = JavaOnlyMap().apply {
    putString("code", when (error) { is PersonalFailure -> error.code; is com.zzzode.leanon.companion.CompanionFailure -> error.code; is InvalidRecordRequest, is org.json.JSONException -> "invalid-request"; else -> "unavailable" })
    putString("message", if (error is PersonalFailure) error.message else "Personal data is unavailable")
  }
  private fun changed(personal: JSONObject) { app().events.dispatch("personal.changed", JSONObject().put("personal", personal).toJavaOnlyMap()) }
  @LynxMethod @Suppress("UNUSED_PARAMETER")
  fun getState(params: ReadableMap?, callback: Callback) {
    scope.launch { callback.invoke(try { JSONObject().put("personal", app().personal.snapshot()).toJavaOnlyMap() } catch (error: Exception) { failure(error) }) }
  }
  @LynxMethod
  fun mutate(params: ReadableMap, callback: Callback) {
    val request = try { decodePersonalRequest(params) } catch (error: Exception) { callback.invoke(failure(error)); return }
    scope.launch {
      val result = try {
        val mutation = request.third
        if (mutation.getString("type") == "add-photo") personalInvalid("Use the explicit photo picker")
        if (mutation.getString("type") in listOf("save-measurement", "update-photo")) {
          val row = mutation.getJSONObject(if (mutation.getString("type") == "save-measurement") "measurement" else "photo")
          if (personalDate(row.opt("date")) > LocalDate.now(app().recordClock()).toString()) personalInvalid("Future record date")
        }
        val response = app().personal.mutate(request.first, request.second, mutation).put("success", true)
        if (!response.getBoolean("replayed")) { app().clearPersonalPreviews(); changed(response.getJSONObject("personal")) }
        response.toJavaOnlyMap()
      } catch (error: Exception) { failure(error) }
      callback.invoke(result)
    }
  }
  @LynxMethod
  fun getPhoto(params: ReadableMap, callback: Callback) {
    val request = try {
      val json = readableJson(params); personalKeys(json, listOf("id", "scope"))
      val id = personalId(json.opt("id")); val scope = if (json.has("scope")) json.opt("scope") as? String else "own"
      if (scope !in listOf("own", "partner")) personalInvalid("Invalid photo scope")
      id to scope
    } catch (error: Exception) { callback.invoke(failure(error)); return }
    val previews = app().personalPreviews
    val generation = try { previews.requestGeneration(request.second ?: "own") }
      catch (error: Exception) { callback.invoke(failure(error)); return }
    scope.launch {
      val result = try {
        val (photo, bytes) = if (request.second == "own") app().personal.photo(request.first) else app().companion.getPeerPhoto(request.first)
        try { JSONObject().put("uri", previews.make(request.second ?: "own", request.first, bytes, generation)).put("width", photo.getInt("width")).put("height", photo.getInt("height")).toJavaOnlyMap() }
        finally { bytes.fill(0) }
      } catch (error: Exception) { failure(error) }
      callback.invoke(result)
    }
  }
  @LynxMethod
  fun pickPhoto(params: ReadableMap, callback: Callback) {
    val request = try {
      val value = readableJson(params); personalKeys(value, listOf("operationId", "expectedRevision", "date", "view", "note"))
      personalId(value.opt("operationId")); personalRevision(value.opt("expectedRevision")); val date = personalDate(value.opt("date"))
      if (date > LocalDate.now(app().recordClock()).toString()) personalInvalid("Future record date")
      if (value.opt("view") !in listOf("front", "side", "back", "other")) personalInvalid("Invalid photo view")
      personalNote(value.opt("note")); value
    } catch (error: Exception) { callback.invoke(failure(error)); return }
    scope.launch {
      try {
        val state = app().personal.snapshot(); val id = request.getString("operationId"); val receipts = state.getJSONArray("processedOperations")
        for (i in 0 until receipts.length()) if (receipts.getJSONObject(i).getString("operationId") == id) {
          val old = receipts.getJSONObject(i).getJSONObject("mutation")
          if (old.optString("type") != "add-photo") throw PersonalFailure("conflict", "Operation identity was reused")
          val photo = old.getJSONObject("photo")
          for (key in listOf("date", "view", "note")) if (personalCanonical(photo.opt(key)) != personalCanonical(request.opt(key))) throw PersonalFailure("conflict", "Operation identity was reused")
          callback.invoke(JSONObject().put("cancelled", false).put("personal", state).put("photoId", photo.getString("id")).toJavaOnlyMap()); return@launch
        }
        if (state.getLong("revision") != request.getLong("expectedRevision")) throw PersonalFailure("conflict", "Personal revision changed")
        main.post {
          val host = nativeModuleActivity(moduleContext)
          if (host == null) { callback.invoke(failure(java.io.IOException("Host unavailable"))); return@post }
          if (!PersonalDocuments.launch(host, image = true) { selected ->
            when (selected) {
              DocumentSelection.Cancelled -> callback.invoke(JSONObject().put("cancelled", true).toJavaOnlyMap())
              DocumentSelection.Unavailable -> callback.invoke(failure(java.io.IOException("Photo picker unavailable")))
              is DocumentSelection.Selected -> scope.launch {
                val result = try {
                  val source = app().contentResolver.openInputStream(selected.uri)?.use { readPersonalBytes(it, 20 * 1024 * 1024) } ?: throw java.io.IOException("Image unavailable")
                  val image = try { PersonalImageProcessor.sanitize(source) } finally { source.fill(0) }
                  try {
                    val photoId = "photo-" + MessageDigest.getInstance("SHA-256").digest(id.toByteArray()).joinToString("") { "%02x".format(it) }
                    val photo = JSONObject().put("id", photoId).put("date", request.getString("date")).put("view", request.getString("view"))
                      .put("createdAt", Instant.now(app().recordClock()).toString()).put("mime", "image/jpeg").put("width", image.width).put("height", image.height)
                    if (request.has("note")) photo.put("note", request.get("note"))
                    val response = app().personal.mutate(id, request.getLong("expectedRevision"), JSONObject().put("type", "add-photo").put("photo", photo), image.bytes)
                    changed(response.getJSONObject("personal"))
                    JSONObject().put("cancelled", false).put("personal", response.getJSONObject("personal")).put("photoId", photoId).toJavaOnlyMap()
                  } finally { image.bytes.fill(0) }
                } catch (error: Exception) { failure(error) }
                callback.invoke(result)
              }
            }
          }) callback.invoke(failure(java.io.IOException("Another document picker is pending")))
        }
      } catch (error: Exception) { callback.invoke(failure(error)) }
    }
  }
}
internal fun decodePersonalRequest(params: ReadableMap): Triple<String, Long, JSONObject> {
  val value = if (params.hasKey("__leanonPersonalRequestJSON")) {
    val plain = readableJson(params); if (plain.length() != 1 || plain.opt("__leanonPersonalRequestJSON") !is String) personalInvalid("Invalid personal envelope")
    val json = plain.getString("__leanonPersonalRequestJSON"); if (json.toByteArray(Charsets.UTF_8).size > 1024 * 1024) personalInvalid("Personal request exceeds supported size")
    try { strictJsonObject(json) } catch (_: Exception) { personalInvalid("Invalid personal envelope") }
  } else readableJson(params)
  personalKeys(value, listOf("operationId", "expectedRevision", "mutation"))
  val mutation = value.optJSONObject("mutation") ?: personalInvalid("Missing personal mutation"); validatePersonalMutation(mutation)
  return Triple(personalId(value.opt("operationId")), personalRevision(value.opt("expectedRevision")), mutation)
}
internal fun readPersonalBytes(stream: InputStream, maximum: Int): ByteArray {
  val output = ByteArrayOutputStream(); val buffer = ByteArray(8192)
  while (output.size() <= maximum) {
    val count = stream.read(buffer, 0, minOf(buffer.size, maximum + 1 - output.size())); if (count < 0) break
    output.write(buffer, 0, count)
  }
  if (output.size() > maximum) throw java.io.IOException("Selected file exceeds supported size")
  return output.toByteArray()
}
