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
import com.zzzode.leanon.scanner.BarcodeScanResult
import com.zzzode.leanon.scanner.BarcodeCameraStatus

/** Native module backing `scanner.*`; opens the camera barcode scanner. */
class ScannerModule(context: Context) : LynxModule(context) {

  private val moduleContext: Context = context

  /** Harmless preflight: camera enumeration and permission checks never open/request a camera. */
  @LynxMethod
  @Suppress("UNUSED_PARAMETER")
  fun getStatus(params: ReadableMap?, callback: Callback) {
    try {
      val activity = currentActivity()
      callback.invoke(JavaOnlyMap().apply {
        putBoolean("cameraAvailable", BarcodeCameraStatus.available(moduleContext))
        putBoolean("hostAvailable", activity != null && !activity.isFinishing && !activity.isDestroyed)
        putString("permission", BarcodeCameraStatus.permission(moduleContext, activity).wire)
      })
    } catch (_: Exception) {
      callback.invoke(JavaOnlyMap().apply {
        putString("code", "unavailable"); putString("message", "Camera status is unavailable")
      })
    }
  }

  /**
   * Launch the full-screen barcode scanner (RFC 0016) and resolve
   * `{barcode}` or `{cancelled}`. The activity handles the camera permission
   * internally; missing a host activity rejects as `unavailable`.
   */
  @LynxMethod
  @Suppress("UNUSED_PARAMETER")
  fun scanBarcode(params: ReadableMap?, callback: Callback) {
    val activity = currentActivity()
    if (activity == null || activity.isFinishing || activity.isDestroyed) {
      val result = JavaOnlyMap()
      result.putString("code", "unavailable")
      result.putString("message", "No host activity")
      result.putMap("details", JavaOnlyMap().apply { putString("reason", "host-missing") })
      callback.invoke(result)
      return
    }
    activity.runOnUiThread {
      if (!BarcodeScanLauncher.launch(activity) { scanned ->
          val result = JavaOnlyMap()
          when (scanned) {
            is BarcodeScanResult.Found -> result.putString("barcode", scanned.barcode)
            BarcodeScanResult.Cancelled -> result.putBoolean("cancelled", true)
            is BarcodeScanResult.Failure -> {
              result.putString("code", scanned.code); result.putString("message", scanned.message)
            }
          }
          callback.invoke(result)
        }) {
        callback.invoke(JavaOnlyMap().apply {
          putString("code", "unavailable"); putString("message", "Barcode scan already pending")
          putMap("details", JavaOnlyMap().apply { putString("reason", "already-pending") })
        })
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
