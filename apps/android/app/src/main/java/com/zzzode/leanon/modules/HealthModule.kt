package com.zzzode.leanon.modules

import android.content.Context
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.react.bridge.ReadableMap
import com.lynx.tasm.behavior.LynxContext
import com.zzzode.leanon.LeanOnApplication
import com.zzzode.leanon.data.RecordsRepository
import com.zzzode.leanon.data.toJavaOnlyMap

/** Native module backing the `health.*` methods; delegates to native/health-adapter. */
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
   * Persist today's weight and return the updated HostData snapshot in a single
   * round trip (RFC 0010). Validation failures return `invalid-request`; any
   * storage problem returns `unavailable`.
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

      val hostData = records().addWeight(date, weightKg)
      val result = JavaOnlyMap()
      result.putBoolean("success", true)
      result.putMap("hostData", hostData.toJavaOnlyMap())
      callback.invoke(result)
    } catch (error: Exception) {
      callback.invoke(
        errorResult("unavailable", error.message ?: "Could not save weight"),
      )
    }
  }

  private fun records(): RecordsRepository {
    val androidContext =
      (moduleContext as? LynxContext)?.getContext() ?: moduleContext
    return (androidContext.applicationContext as LeanOnApplication).records
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
