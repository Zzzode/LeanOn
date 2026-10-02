package com.zzzode.leanon.modules

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.react.bridge.ReadableMap
import com.lynx.tasm.behavior.LynxContext
import com.zzzode.leanon.scanner.BarcodeScanLauncher

/** Native module backing `scanner.*`; opens the camera barcode scanner. */
class ScannerModule(context: Context) : LynxModule(context) {

  private val moduleContext: Context = context

  /**
   * Launch the full-screen barcode scanner (RFC 0016) and resolve
   * `{barcode}` or `{cancelled}`. The activity handles the camera permission
   * internally; missing a host activity rejects as `unavailable`.
   */
  @LynxMethod
  fun scanBarcode(params: ReadableMap, callback: Callback) {
    val activity = currentActivity()
    if (activity == null) {
      val result = JavaOnlyMap()
      result.putString("code", "unavailable")
      result.putString("message", "No host activity")
      callback.invoke(result)
      return
    }
    BarcodeScanLauncher.launch(activity) { barcode ->
      activity.runOnUiThread {
        val result = JavaOnlyMap()
        if (barcode == null) {
          result.putBoolean("cancelled", true)
        } else {
          result.putString("barcode", barcode)
        }
        callback.invoke(result)
      }
    }
  }

  /** Walk the context chain to the hosting Activity, unwrapping Lynx contexts. */
  private fun currentActivity(): Activity? {
    val androidContext =
      (moduleContext as? LynxContext)?.getContext() ?: moduleContext
    var current: Context? = androidContext
    while (current is ContextWrapper) {
      if (current is Activity) return current
      current = current.baseContext
    }
    return null
  }
}
