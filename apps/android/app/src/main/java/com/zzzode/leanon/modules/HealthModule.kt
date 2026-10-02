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
import org.json.JSONObject
import java.util.NoSuchElementException
import java.util.UUID

/** Native module backing the `health.*` methods; delegates to the record store. */
class HealthModule(context: Context) : LynxModule(context) {

  private val moduleContext: Context = context

  @LynxMethod
  fun authorize(params: ReadableMap, callback: Callback) {
    // TODO: request Health Connect permissions; callback {granted: Boolean, deniedTypes: String[]}
    // Emit "health.authorizationChanged" when the grant set changes.
  }

  @LynxMethod
  fun readSamples(params: ReadableMap, callback: Callback) {
    // TODO: query Health Connect for the requested types/window; callback HealthSampleDto[]
  }

  /**
   * Persist today's weight and return the updated HostData in one round trip
   * (RFC 0010). After the write the host emits `records.changed` (RFC 0011).
   */
  @LynxMethod
  fun writeWeight(params: ReadableMap, callback: Callback) {
    try {
      if (!params.hasKey("date") || !params.hasKey("weightKg")) {
        callback.invoke(errorResult("invalid-request", "Missing date or weightKg"))
        return
      }
      val date = params.getString("date")
      val weightKg = params.getDouble("weightKg")
      if (
        date == null ||
        !weightKg.isFinite() ||
        weightKg < MIN_WEIGHT_KG ||
        weightKg > MAX_WEIGHT_KG
      ) {
        callback.invoke(
          errorResult("invalid-request", "Weight must be between 20 and 300 kg"),
        )
        return
      }

      val application = app()
      val hostData = application.records.addWeight(date, weightKg)
      application.events.dispatch("records.changed", changedPayload(hostData))
      application.healthConnect.onRecordsChanged()
      callback.invoke(successResult(hostData))
    } catch (error: Exception) {
      callback.invoke(
        errorResult("unavailable", error.message ?: "Could not save weight"),
      )
    }
  }

  /**
   * Add a meal to the day's intake (accumulated) and return the updated HostData
   * (RFC 0012). Emits `records.changed` after the write like the other paths.
   */
  @LynxMethod
  fun writeIntake(params: ReadableMap, callback: Callback) {
    try {
      if (
        !params.hasKey("date") ||
        !params.hasKey("kcal") ||
        !params.hasKey("macros")
      ) {
        callback.invoke(
          errorResult("invalid-request", "Missing date, kcal or macros"),
        )
        return
      }
      val date = params.getString("date")
      val kcal = params.getDouble("kcal")
      val macros = params.getMap("macros")
      if (
        date == null ||
        !kcal.isFinite() ||
        kcal <= 0 ||
        macros == null ||
        !macros.hasKey("proteinG") ||
        !macros.hasKey("carbsG") ||
        !macros.hasKey("fatG")
      ) {
        callback.invoke(errorResult("invalid-request", "Invalid meal"))
        return
      }
      val proteinG = macros.getDouble("proteinG")
      val carbsG = macros.getDouble("carbsG")
      val fatG = macros.getDouble("fatG")
      if (
        !proteinG.isFinite() || !carbsG.isFinite() || !fatG.isFinite() ||
        proteinG < 0 || carbsG < 0 || fatG < 0
      ) {
        callback.invoke(errorResult("invalid-request", "Invalid macros"))
        return
      }

      val microsMap =
        if (params.hasKey("micros") && !params.isNull("micros")) {
          params.getMap("micros")
        } else {
          null
        }
      val fiberG = microsMap.microValue("fiberG")
      val sugarG = microsMap.microValue("sugarG")
      val saturatedFatG = microsMap.microValue("saturatedFatG")
      val sodiumMg = microsMap.microValue("sodiumMg")

      val foodId =
        if (params.hasKey("foodId") && !params.isNull("foodId")) {
          params.getString("foodId")
        } else {
          null
        }

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
      callback.invoke(
        errorResult("unavailable", error.message ?: "Could not save meal"),
      )
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
      val date = requiredString(params, "date")
      if (!params.hasKey("amountMl")) {
        throw InvalidRequest("Missing amountMl")
      }
      val amountMl = params.getDouble("amountMl")
      if (!amountMl.isFinite() || amountMl < 0) {
        throw InvalidRequest("amountMl must be a finite non-negative number")
      }

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
      if (!params.hasKey("favorite")) throw InvalidRequest("Missing favorite")
      val favorite = params.getBoolean("favorite")
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
      val barcode = requiredString(params, "barcode")
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
      val date = requiredString(params, "date")
      val typeId = requiredString(params, "typeId")
      if (!params.hasKey("durationMin")) {
        throw InvalidRequest("Missing durationMin")
      }
      val durationMin = params.getDouble("durationMin")
      if (!durationMin.isFinite() || durationMin <= 0) {
        throw InvalidRequest("durationMin must be a finite positive number")
      }
      if (!params.hasKey("kcal")) throw InvalidRequest("Missing kcal")
      val kcal = params.getDouble("kcal")
      if (!kcal.isFinite() || kcal <= 0) {
        throw InvalidRequest("kcal must be a finite positive number")
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
      val date = requiredString(params, "date")
      val typeId = requiredString(params, "typeId")
      if (!params.hasKey("durationMin")) {
        throw InvalidRequest("Missing durationMin")
      }
      val durationMin = params.getDouble("durationMin")
      if (!durationMin.isFinite() || durationMin <= 0) {
        throw InvalidRequest("durationMin must be a finite positive number")
      }
      if (!params.hasKey("kcal")) throw InvalidRequest("Missing kcal")
      val kcal = params.getDouble("kcal")
      if (!kcal.isFinite() || kcal <= 0) {
        throw InvalidRequest("kcal must be a finite positive number")
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
      application.healthConnect.onRecordsChanged()
      callback.invoke(successResult(hostData))
    } catch (error: Exception) {
      callback.invoke(failure(error))
    }
  }

  /** Read an optional per-100 g macro; missing = 0, invalid = null. */
  private fun optionalMacro(params: ReadableMap, key: String): Double? {
    if (!params.hasKey(key)) return 0.0
    val value = params.getDouble(key)
    return if (value.isFinite() && value >= 0) value else null
  }

  /** Read a nested optional micronutrient; missing map/key = 0, invalid = throw. */
  private fun ReadableMap?.microValue(key: String): Double {
    if (this == null) return 0.0
    val value = optionalMacro(this, key)
    if (value == null) throw InvalidRequest("Invalid $key")
    return value
  }

  /** Read a mandatory non-empty string parameter. */
  private fun requiredString(params: ReadableMap, key: String): String {
    val value = if (params.hasKey(key)) params.getString(key) else null
    if (value == null) throw InvalidRequest("Missing $key")
    return value
  }

  /** Validate the editable content shared by create and update. */
  private fun parseCustomFoodFields(params: ReadableMap): CustomFoodFields {
    if (!params.hasKey("name") || !params.hasKey("kcal")) {
      throw InvalidRequest("Missing name or kcal")
    }
    val name = params.getString("name")?.trim()
    val kcal = params.getDouble("kcal")
    if (name == null || name.isEmpty() || !kcal.isFinite() || kcal <= 0) {
      throw InvalidRequest("Name is required and kcal > 0")
    }
    val proteinG = optionalMacro(params, "proteinG")
    val carbsG = optionalMacro(params, "carbsG")
    val fatG = optionalMacro(params, "fatG")
    val fiberG = optionalMacro(params, "fiberG")
    val sugarG = optionalMacro(params, "sugarG")
    val saturatedFatG = optionalMacro(params, "saturatedFatG")
    val sodiumMg = optionalMacro(params, "sodiumMg")
    if (
      proteinG == null || carbsG == null || fatG == null ||
      fiberG == null || sugarG == null || saturatedFatG == null || sodiumMg == null
    ) {
      throw InvalidRequest("Nutrition values must be finite and non-negative")
    }
    var defaultGrams: Double? = null
    if (params.hasKey("defaultGrams") && !params.isNull("defaultGrams")) {
      val value = params.getDouble("defaultGrams")
      if (!value.isFinite() || value <= 0) {
        throw InvalidRequest("defaultGrams must be greater than 0")
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
      is NoSuchElementException ->
        errorResult("not-found", error.message ?: "Not found")
      is InvalidRequest ->
        errorResult("invalid-request", error.message ?: "Invalid request")
      else -> errorResult("unavailable", error.message ?: "Request failed")
    }

  private class InvalidRequest(message: String) : Exception(message)

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
