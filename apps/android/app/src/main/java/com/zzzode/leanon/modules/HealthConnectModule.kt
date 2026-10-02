package com.zzzode.leanon.modules

import android.content.Context
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.react.bridge.ReadableMap
import com.lynx.tasm.behavior.LynxContext
import com.zzzode.leanon.MainActivity
import com.zzzode.leanon.LeanOnApplication
import com.zzzode.leanon.data.toJavaOnlyMap
import com.zzzode.leanon.healthconnect.HealthConnectPermission
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Lynx module for Health Connect (RFC 0021 export; RFC 0025 two-way sync):
 * status, permission, enable/disable and a manual sync. Availability,
 * permissions and sync are asynchronous.
 */
class HealthConnectModule(context: Context) : LynxModule(context) {

  private val moduleContext: Context = context
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  private fun androidContext(): Context =
    (moduleContext as? LynxContext)?.getContext() ?: moduleContext

  private fun app(): LeanOnApplication =
    androidContext().applicationContext as LeanOnApplication

  @LynxMethod
  fun getStatus(callback: Callback) {
    val application = app()
    scope.launch {
      val manager = application.healthConnect
      val supported = manager.isSupported()
      val granted = if (supported) manager.permissionsGranted() else false
      val result = JavaOnlyMap()
      result.putBoolean("supported", supported)
      result.putBoolean("enabled", application.settings.getHealthConnectEnabled())
      result.putBoolean("permissionsGranted", granted)
      result.putDouble(
        "lastSyncEpochMs",
        application.settings.getLastSyncEpochMs().toDouble(),
      )
      callback.invoke(result)
    }
  }

  @LynxMethod
  fun requestPermission(callback: Callback) {
    val application = app()
    val activity = androidContext() as? MainActivity
    if (activity == null || !application.healthConnect.isSupported()) {
      callback.invoke(JavaOnlyMap().apply { putBoolean("granted", false) })
      return
    }
    HealthConnectPermission.launch(activity.healthConnectPermissionLauncher) { granted ->
      callback.invoke(JavaOnlyMap().apply { putBoolean("granted", granted) })
    }
  }

  @LynxMethod
  fun setEnabled(params: ReadableMap, callback: Callback) {
    val enabled = params.getBoolean("enabled")
    val application = app()
    application.settings.setHealthConnectEnabled(enabled)
    if (enabled) {
      application.healthConnect.syncAsync { }
    }
    callback.invoke(JavaOnlyMap().apply { putBoolean("success", true) })
  }

  /**
   * Run a two-way sync now (RFC 0025): mirror external weight/exercise and
   * export LeanOn records, then return the refreshed HostData.
   */
  @LynxMethod
  fun sync(callback: Callback) {
    val application = app()
    application.healthConnect.syncAsync { ok ->
      if (ok) {
        val hostData = application.records.loadHostData()
        val result = JavaOnlyMap()
        result.putBoolean("success", true)
        result.putMap("hostData", hostData.toJavaOnlyMap())
        callback.invoke(result)
      } else {
        val error = JavaOnlyMap()
        error.putString("code", "unavailable")
        error.putString("message", "Health Connect sync failed")
        callback.invoke(error)
      }
    }
  }
}
