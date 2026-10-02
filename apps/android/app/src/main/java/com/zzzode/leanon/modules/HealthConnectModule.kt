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
import com.zzzode.leanon.healthconnect.HealthConnectPermission
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Lynx module for the Health Connect export (RFC 0021): status, permission and
 * enable/disable. Availability and granted-permission checks are asynchronous.
 */
class HealthConnectModule(context: Context) : LynxModule(context) {

  private val moduleContext: Context = context
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  private fun androidContext(): Context =
    (moduleContext as? LynxContext)?.getContext() ?: moduleContext

  private fun app(): LeanOnApplication =
    androidContext().applicationContext as LeanOnApplication

  private fun booleanMap(vararg pairs: Pair<String, Boolean>): JavaOnlyMap =
    JavaOnlyMap().apply {
      pairs.forEach { (key, value) -> putBoolean(key, value) }
    }

  @LynxMethod
  fun getStatus(callback: Callback) {
    val application = app()
    val manager = application.healthConnect
    scope.launch {
      val supported = manager?.isSupported() == true
      val granted = if (supported) manager?.permissionsGranted() == true else false
      callback.invoke(
        booleanMap(
          "supported" to supported,
          "enabled" to application.settings.getHealthConnectEnabled(),
          "permissionsGranted" to granted,
        ),
      )
    }
  }

  @LynxMethod
  fun requestPermission(callback: Callback) {
    val application = app()
    val activity = androidContext() as? MainActivity
    if (activity == null || application.healthConnect?.isSupported() != true) {
      callback.invoke(booleanMap("granted" to false))
      return
    }
    HealthConnectPermission.launch(activity.healthConnectPermissionLauncher) { granted ->
      callback.invoke(booleanMap("granted" to granted))
    }
  }

  @LynxMethod
  fun setEnabled(params: ReadableMap, callback: Callback) {
    val enabled = params.getBoolean("enabled")
    val application = app()
    application.settings.setHealthConnectEnabled(enabled)
    if (enabled) application.healthConnect?.syncAllAsync()
    callback.invoke(booleanMap("success" to true))
  }
}
