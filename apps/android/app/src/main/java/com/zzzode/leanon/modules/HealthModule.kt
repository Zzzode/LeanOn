package com.zzzode.leanon.modules

import android.content.Context
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.react.bridge.ReadableMap
import com.lynx.tasm.behavior.LynxContext
import com.zzzode.leanon.LeanOnApplication
import com.zzzode.leanon.data.toJavaOnlyMap
import com.zzzode.leanon.data.RecordsFailure
import org.json.JSONObject
import java.util.NoSuchElementException
import java.util.UUID

/** Native module backing the `health.*` methods; delegates to the record store. */
class HealthModule(context: Context) : LynxModule(context) {

  private val moduleContext: Context = context

  @LynxMethod
  fun authorize(params: ReadableMap, callback: Callback) {
    callback.invoke(errorResult("unavailable", "Use healthConnect.requestPermission for the Android adapter"))
  }

  @LynxMethod
  fun readSamples(params: ReadableMap, callback: Callback) {
    callback.invoke(errorResult("unavailable", "Generic health samples are not implemented"))
  }

  /**
   * Persist today's weight and return the updated HostData in one round trip
   * (RFC 0010). After the write the host emits `records.changed` (RFC 0011).
   */
  @LynxMethod
  fun writeWeight(params: ReadableMap, callback: Callback) {
    try {
      val date = RecordRequest.date(params)
      val weightKg = RecordRequest.number(params, "weightKg")
      if (weightKg < MIN_WEIGHT_KG || weightKg > MAX_WEIGHT_KG) {
        throw InvalidRecordRequest("Weight must be between 20 and 300 kg")
      }

      val application = app()
      val hostData = application.records.addWeight(date, weightKg)
      application.events.dispatch("records.changed", changedPayload(hostData))
      application.healthConnect.onRecordsChanged()
      callback.invoke(successResult(hostData))
    } catch (error: Exception) {
      callback.invoke(failure(error))
    }
  }

  /**
   * Add a meal to the day's intake (accumulated) and return the updated HostData
   * (RFC 0012). Emits `records.changed` after the write like the other paths.
   */
  @LynxMethod
  fun writeIntake(params: ReadableMap, callback: Callback) {
    try {
      val date = RecordRequest.date(params)
      val kcal = RecordRequest.number(params, "kcal", positive = true)
      val macros = RecordRequest.map(params, "macros")
      val proteinG = RecordRequest.number(macros, "proteinG")
      val carbsG = RecordRequest.number(macros, "carbsG")
      val fatG = RecordRequest.number(macros, "fatG")
      val microsMap = if (params.hasKey("micros") && !params.isNull("micros")) {
        RecordRequest.map(params, "micros")
      } else null
      val fiberG = microsMap.microValue("fiberG")
      val sugarG = microsMap.microValue("sugarG")
      val saturatedFatG = microsMap.microValue("saturatedFatG")
      val sodiumMg = microsMap.microValue("sodiumMg")
      val foodId = if (params.hasKey("foodId") && !params.isNull("foodId")) {
        RecordRequest.string(params, "foodId")
      } else null

      val application = app()
      val hostData =
        application.records.addIntake(
          date,
          kcal,
          proteinG,
          carbsG,
          fatG,
          fiberG,
          sugarG,
          saturatedFatG,
          sodiumMg,
          foodId,
        )
      application.events.dispatch("records.changed", changedPayload(hostData))
      application.healthConnect.onRecordsChanged()
      callback.invoke(successResult(hostData))
    } catch (error: Exception) {
      callback.invoke(failure(error))
    }
  }

  /**
   * Upsert the day's total water in millilitres (RFC 0023) and return the
   * updated HostData. The page sends the absolute total after a +/− cup tap;
   * removing a cup simply writes a lower total. Emits `records.changed`.
   */
  @LynxMethod
  fun writeWater(params: ReadableMap, callback: Callback) {
    try {
      val date = RecordRequest.date(params)
      val amountMl = RecordRequest.number(params, "amountMl")

      val application = app()
      val hostData = application.records.upsertWater(date, amountMl)
      application.events.dispatch("records.changed", changedPayload(hostData))
      callback.invoke(successResult(hostData))
    } catch (error: Exception) {
      callback.invoke(failure(error))
    }
  }

  /** Pin or unpin a food id (RFC 0015) and return the updated HostData. */
  @LynxMethod
  fun setFoodFavorite(params: ReadableMap, callback: Callback) {
    try {
      val id = requiredString(params, "id")
      val favorite = RecordRequest.boolean(params, "favorite")
      val application = app()
      val hostData = application.records.setFoodFavorite(id, favorite)
      application.events.dispatch("records.changed", changedPayload(hostData))
      callback.invoke(successResult(hostData))
    } catch (error: Exception) {
      callback.invoke(failure(error))
    }
  }

  /**
   * Create and persist a user-owned custom food (RFC 0013), then return the
   * updated HostData. The host generates the id and emits `records.changed`.
   */
  @LynxMethod
  fun writeCustomFood(params: ReadableMap, callback: Callback) {
    try {
      val fields = parseCustomFoodFields(params)
      val id = "custom-" + UUID.randomUUID().toString().take(8)
      val application = app()
      val hostData =
        application.records.addCustomFood(
          id,
          fields.name,
          fields.kcal,
          fields.proteinG,
          fields.carbsG,
          fields.fatG,
          fields.defaultGrams,
          fields.fiberG,
          fields.sugarG,
          fields.saturatedFatG,
          fields.sodiumMg,
        )
      application.events.dispatch("records.changed", changedPayload(hostData))
      callback.invoke(successResult(hostData))
    } catch (error: Exception) {
      callback.invoke(failure(error))
    }
  }

  /** Replace a user-owned custom food (RFC 0014) and return the HostData. */
  @LynxMethod
  fun updateCustomFood(params: ReadableMap, callback: Callback) {
    try {
      val id = requiredString(params, "id")
      val fields = parseCustomFoodFields(params)
      val application = app()
      val hostData =
        application.records.updateCustomFood(
          id,
          fields.name,
          fields.kcal,
          fields.proteinG,
          fields.carbsG,
          fields.fatG,
          fields.defaultGrams,
          fields.fiberG,
          fields.sugarG,
          fields.saturatedFatG,
          fields.sodiumMg,
        )
      application.events.dispatch("records.changed", changedPayload(hostData))
      callback.invoke(successResult(hostData))
    } catch (error: Exception) {
      callback.invoke(failure(error))
    }
  }

  /** Remove a user-owned custom food (RFC 0014) and return the HostData. */
  @LynxMethod
  fun deleteCustomFood(params: ReadableMap, callback: Callback) {
    try {
      val id = requiredString(params, "id")
      val application = app()
      val hostData = application.records.deleteCustomFood(id)
      application.events.dispatch("records.changed", changedPayload(hostData))
      callback.invoke(successResult(hostData))
    } catch (error: Exception) {
      callback.invoke(failure(error))
    }
  }

  /**
   * Upsert a food imported from Open Food Facts (RFC 0016), keyed by
   * `off-<barcode>`, and return the updated HostData.
   */
  @LynxMethod
  fun writeScannedFood(params: ReadableMap, callback: Callback) {
    try {
      val barcode = productBarcode(params) ?: throw InvalidRecordRequest("Invalid product barcode")
      val fields = parseCustomFoodFields(params)
      val foodName = JSONObject()
        .put("en", fields.name)
        .put("zh-CN", fields.name)
      val macros = JSONObject()
        .put("proteinG", fields.proteinG)
        .put("carbsG", fields.carbsG)
        .put("fatG", fields.fatG)
      val micros = JSONObject()
        .put("fiberG", fields.fiberG)
        .put("sugarG", fields.sugarG)
        .put("saturatedFatG", fields.saturatedFatG)
        .put("sodiumMg", fields.sodiumMg)
      val item = JSONObject()
        .put("id", "off-$barcode")
        .put("name", foodName)
        .put("kcal", fields.kcal)
        .put("macros", macros)
        .put("micros", micros)
        .put("source", "open-food-facts")
        .put("barcode", barcode)
      if (fields.defaultGrams !== null) {
        item.put("defaultGrams", fields.defaultGrams)
      }

      val application = app()
      val hostData = application.records.upsertUserFood(item)
      application.events.dispatch("records.changed", changedPayload(hostData))
      callback.invoke(successResult(hostData))
    } catch (error: Exception) {
      callback.invoke(failure(error))
    }
  }

  /**
   * Log an exercise session (RFC 0017) and return the updated HostData. The page
   * passes the kilocalories it calculated; the host only validates and persists.
   */
  @LynxMethod
  fun writeExercise(params: ReadableMap, callback: Callback) {
    try {
      val date = RecordRequest.date(params)
      val typeId = requiredString(params, "typeId")
      val durationMin = RecordRequest.duration(params)
      if (!params.hasKey("kcal")) throw InvalidRecordRequest("Missing kcal")
      val kcal = RecordRequest.number(params, "kcal", positive = true)
      if (!kcal.isFinite() || kcal <= 0) {
        throw InvalidRecordRequest("kcal must be a finite positive number")
      }

      val application = app()
      val hostData =
        application.records.addExercise(date, typeId, durationMin, kcal)
      application.events.dispatch("records.changed", changedPayload(hostData))
      application.healthConnect.onRecordsChanged()
      callback.invoke(successResult(hostData))
    } catch (error: Exception) {
      callback.invoke(failure(error))
    }
  }

  /** Replace an exercise session (RFC 0018) and return the updated HostData. */
  @LynxMethod
  fun updateExercise(params: ReadableMap, callback: Callback) {
    try {
      val id = requiredString(params, "id")
      val date = RecordRequest.date(params)
      val typeId = requiredString(params, "typeId")
      val durationMin = RecordRequest.duration(params)
      if (!params.hasKey("kcal")) throw InvalidRecordRequest("Missing kcal")
      val kcal = RecordRequest.number(params, "kcal", positive = true)
      if (!kcal.isFinite() || kcal <= 0) {
        throw InvalidRecordRequest("kcal must be a finite positive number")
      }

      val application = app()
      val hostData =
        application.records.updateExercise(
          id,
          date,
          typeId,
          durationMin,
          kcal,
        )
      application.events.dispatch("records.changed", changedPayload(hostData))
      application.healthConnect.onRecordsChanged()
      callback.invoke(successResult(hostData))
    } catch (error: Exception) {
      callback.invoke(failure(error))
    }
  }

  /** Delete an exercise session (RFC 0018) and return the updated HostData. */
  @LynxMethod
  fun deleteExercise(params: ReadableMap, callback: Callback) {
    try {
      val id = requiredString(params, "id")
      val application = app()
      val hostData = application.records.deleteExercise(id)
      application.events.dispatch("records.changed", changedPayload(hostData))
      // Reconcile the exported session (RFC 0025); onRecordsChanged alone
      // re-exports but never deletes the orphaned record.
      application.healthConnect.deleteExerciseSessionAsync(id)
      application.healthConnect.onRecordsChanged()
      callback.invoke(successResult(hostData))
    } catch (error: Exception) {
      callback.invoke(failure(error))
    }
  }

  /** Optional nutrients default to zero only when absent; explicit null is invalid. */
  private fun optionalMacro(params: ReadableMap, key: String): Double =
    RecordRequest.number(params, key, default = 0.0)

  private fun ReadableMap?.microValue(key: String): Double =
    if (this == null) 0.0 else optionalMacro(this, key)

  private fun requiredString(params: ReadableMap, key: String): String =
    RecordRequest.string(params, key)

  /** Validate the editable content shared by create and update. */
  private fun parseCustomFoodFields(params: ReadableMap): CustomFoodFields {
    if (!params.hasKey("name") || !params.hasKey("kcal")) {
      throw InvalidRecordRequest("Missing name or kcal")
    }
    val name = RecordRequest.string(params, "name").trim()
    val kcal = RecordRequest.number(params, "kcal", positive = true)
    if (name.isEmpty() || !kcal.isFinite() || kcal <= 0) {
      throw InvalidRecordRequest("Name is required and kcal > 0")
    }
    val proteinG = optionalMacro(params, "proteinG")
    val carbsG = optionalMacro(params, "carbsG")
    val fatG = optionalMacro(params, "fatG")
    val fiberG = optionalMacro(params, "fiberG")
    val sugarG = optionalMacro(params, "sugarG")
    val saturatedFatG = optionalMacro(params, "saturatedFatG")
    val sodiumMg = optionalMacro(params, "sodiumMg")
    var defaultGrams: Double? = null
    if (params.hasKey("defaultGrams") && !params.isNull("defaultGrams")) {
      val value = RecordRequest.number(params, "defaultGrams", positive = true)
      if (!value.isFinite() || value <= 0) {
        throw InvalidRecordRequest("defaultGrams must be greater than 0")
      }
      defaultGrams = value
    }
    return CustomFoodFields(
      name,
      kcal,
      proteinG,
      carbsG,
      fatG,
      fiberG,
      sugarG,
      saturatedFatG,
      sodiumMg,
      defaultGrams,
    )
  }

  /** Map a thrown error to the native error result the bridge expects. */
  private fun failure(error: Exception): JavaOnlyMap =
    when (error) {
      is RecordsFailure -> errorResult(error.code, error.message ?: "Record request failed")
      is NoSuchElementException ->
        errorResult("not-found", error.message ?: "Not found")
      is InvalidRecordRequest ->
        errorResult("invalid-request", error.message ?: "Invalid request")
      else -> errorResult("unavailable", error.message ?: "Request failed")
    }

  private data class CustomFoodFields(
    val name: String,
    val kcal: Double,
    val proteinG: Double,
    val carbsG: Double,
    val fatG: Double,
    val fiberG: Double,
    val sugarG: Double,
    val saturatedFatG: Double,
    val sodiumMg: Double,
    val defaultGrams: Double?,
  )

  private fun app(): LeanOnApplication {
    val androidContext =
      (moduleContext as? LynxContext)?.getContext() ?: moduleContext
    return androidContext.applicationContext as LeanOnApplication
  }

  private fun changedPayload(hostData: org.json.JSONObject): JavaOnlyMap {
    val payload = JavaOnlyMap()
    payload.putMap("hostData", hostData.toJavaOnlyMap())
    return payload
  }

  private fun successResult(hostData: org.json.JSONObject): JavaOnlyMap {
    val result = JavaOnlyMap()
    result.putBoolean("success", true)
    result.putMap("hostData", hostData.toJavaOnlyMap())
    return result
  }

  private fun errorResult(code: String, message: String): JavaOnlyMap {
    val map = JavaOnlyMap()
    map.putString("code", code)
    map.putString("message", message)
    return map
  }

  private companion object {
    const val MIN_WEIGHT_KG = 20.0
    const val MAX_WEIGHT_KG = 300.0
  }
}
