package com.zzzode.leanon.modules

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.react.bridge.ReadableMap
import com.zzzode.leanon.data.toJavaOnlyMap
import com.zzzode.leanon.net.OpenFoodFactsClient
import com.zzzode.leanon.net.foodLookupFailureReason

/** Native module backing `food.*`; looks packaged products up in Open Food Facts. */
class FoodModule(context: Context) : LynxModule(context) {

  private val main = Handler(Looper.getMainLooper())

  /**
   * Fetch the Open Food Facts product for a barcode off the main thread (RFC
   * 0016) and resolve `{found, product}`; transport errors reject as
   * `unavailable`. The raw product is returned and parsed in TypeScript.
   */
  @LynxMethod
  fun lookupProduct(params: ReadableMap?, callback: Callback) {
    val barcode = productBarcode(params)
    if (barcode == null) {
      callback.invoke(errorResult("invalid-request", "Invalid product barcode"))
      return
    }

    Thread {
      try {
        val product = OpenFoodFactsClient().lookup(barcode)
        main.post {
          if (product == null) {
            val result = JavaOnlyMap()
            result.putBoolean("found", false)
            callback.invoke(result)
          } else {
            val result = JavaOnlyMap()
            result.putBoolean("found", true)
            result.putMap("product", product.toJavaOnlyMap())
            callback.invoke(result)
          }
        }
      } catch (error: Exception) {
        main.post {
          callback.invoke(
            errorResult("unavailable", error.message ?: "Lookup failed", foodLookupFailureReason(error)),
          )
        }
      }
    }.start()
  }

  private fun errorResult(code: String, message: String, reason: String? = null): JavaOnlyMap {
    val map = JavaOnlyMap()
    map.putString("code", code)
    map.putString("message", message)
    if (reason != null) map.putMap("details", JavaOnlyMap().apply {
      putString("reason", reason); putBoolean("retriable", true)
    })
    return map
  }
}
