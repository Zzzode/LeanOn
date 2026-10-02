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

      val application = app()
      val hostData =
        application.records.addIntake(date, kcal, proteinG, carbsG, fatG)
      application.events.dispatch("records.changed", changedPayload(hostData))
      callback.invoke(successResult(hostData))
    } catch (error: Exception) {
      callback.invoke(
        errorResult("unavailable", error.message ?: "Could not save meal"),
      )
    }
  }

  /**
   * Create and persist a user-owned custom food (RFC 0013), then return the
   * updated HostData. The host generates the id, mirrors the name across locales,
   * and emits `records.changed` like every other write.
   */
  @LynxMethod
  fun writeCustomFood(params: ReadableMap, callback: Callback) {
    try {
      if (!params.hasKey("name") || !params.hasKey("kcal")) {
        callback.invoke(errorResult("invalid-request", "Missing name or kcal"))
        return
      }
      val name = params.getString("name")?.trim()
      val kcal = params.getDouble("kcal")
      if (name == null || name.isEmpty() || !kcal.isFinite() || kcal <= 0) {
        callback.invoke(
          errorResult("invalid-request", "Name is required and kcal > 0"),
        )
        return
      }
      val proteinG = optionalMacro(params, "proteinG")
      val carbsG = optionalMacro(params, "carbsG")
      val fatG = optionalMacro(params, "fatG")
      if (proteinG == null || carbsG == null || fatG == null) {
        callback.invoke(
          errorResult("invalid-request", "Macros must be finite and non-negative"),
        )
        return
      }
      var defaultGrams: Double? = null
      if (params.hasKey("defaultGrams")) {
        val value = params.getDouble("defaultGrams")
        if (!value.isFinite() || value <= 0) {
          callback.invoke(
            errorResult("invalid-request", "defaultGrams must be greater than 0"),
          )
          return
        }
        defaultGrams = value
      }

      val id = "custom-" + UUID.randomUUID().toString().take(8)
      val application = app()
      val hostData =
        application.records.addCustomFood(
          id, name, kcal, proteinG, carbsG, fatG, defaultGrams,
        )
      application.events.dispatch("records.changed", changedPayload(hostData))
      callback.invoke(successResult(hostData))
    } catch (error: Exception) {
      callback.invoke(
        errorResult("unavailable", error.message ?: "Could not save food"),
      )
    }
  }

  /** Read an optional per-100 g macro; missing = 0, invalid = null. */
  private fun optionalMacro(params: ReadableMap, key: String): Double? {
    if (!params.hasKey(key)) return 0.0
    val value = params.getDouble(key)
    return if (value.isFinite() && value >= 0) value else null
  }

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
