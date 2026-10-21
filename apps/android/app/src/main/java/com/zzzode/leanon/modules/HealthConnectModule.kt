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
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

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
  @Suppress("UNUSED_PARAMETER")
  fun getStatus(params: ReadableMap?, callback: Callback) {
    scope.launch {
      val result = try {
        val application = app()
        val manager = application.healthConnect
        val supported = manager.isSupported()
        val granted = supported && manager.permissionsGranted()
        JavaOnlyMap().apply {
          putBoolean("supported", supported)
          putBoolean("enabled", application.settings.getHealthConnectEnabled())
          putBoolean("permissionsGranted", granted)
          putDouble("lastSyncEpochMs", application.settings.getLastSyncEpochMs().toDouble())
        }
      } catch (_: Exception) { errorResult("unavailable", "Unable to read Health Connect status") }
      callback.invoke(result)
    }
  }

  @LynxMethod
  @Suppress("UNUSED_PARAMETER")
  fun requestPermission(params: ReadableMap?, callback: Callback) {
    val application = app()
    val activity = androidContext() as? MainActivity
    if (activity == null || !application.healthConnect.isSupported()) {
      callback.invoke(JavaOnlyMap().apply { putBoolean("granted", false) })
      return
    }
    activity.runOnUiThread {
      if (!HealthConnectPermission.launch(activity.healthConnectPermissionLauncher) { granted ->
          callback.invoke(JavaOnlyMap().apply { putBoolean("granted", granted) })
        }) {
        callback.invoke(JavaOnlyMap().apply {
          putString("code", "unavailable"); putString("message", "Health permission request already pending")
        })
      }
    }
  }

  @LynxMethod
  fun setEnabled(params: ReadableMap, callback: Callback) {
    val enabled = try { RecordRequest.boolean(params, "enabled") } catch (error: InvalidRecordRequest) {
      callback.invoke(errorResult("invalid-request", error.message ?: "Invalid Health Connect setting"))
      return
    }
    scope.launch {
      val result = try {
        ENABLE_LOCK.withLock {
          val application = app()
          val manager = application.healthConnect
          enableHealthConnectDurably(enabled, manager::isSupported, manager::permissionsGranted,
            application.settings::getHealthConnectEnabled, application.settings::setHealthConnectEnabled,
            manager::sync)
          JavaOnlyMap().apply { putBoolean("success", true) }
        }
      } catch (error: HealthConnectOperationFailure) {
        errorResult(error.code, error.message ?: "Health Connect update failed")
      } catch (_: Exception) { errorResult("unavailable", "Unable to persist Health Connect setting") }
      callback.invoke(result)
    }
  }

  /**
   * Run a two-way sync now (RFC 0025): mirror external weight/exercise and
   * export LeanOn records, then return the refreshed HostData.
   */
  @LynxMethod
  @Suppress("UNUSED_PARAMETER")
  fun sync(params: ReadableMap?, callback: Callback) {
    scope.launch {
      val result = try {
        val application = app()
        val manager = application.healthConnect
        if (!manager.isSupported()) errorResult("unavailable", "Health Connect is unavailable")
        else if (!manager.permissionsGranted()) errorResult("not-authorized", "Health Connect permissions are required")
        else if (!manager.sync()) errorResult("unavailable", "Health Connect sync failed")
        else JavaOnlyMap().apply {
          putBoolean("success", true)
          putMap("hostData", application.records.currentSnapshot().toJavaOnlyMap())
        }
      } catch (_: Exception) { errorResult("unavailable", "Health Connect sync failed") }
      callback.invoke(result)
    }
  }

  private fun errorResult(code: String, message: String) = JavaOnlyMap().apply {
    putString("code", code); putString("message", message)
  }

  private companion object { val ENABLE_LOCK = Mutex() }
}

internal class HealthConnectOperationFailure(val code: String, message: String) : Exception(message)

/** Enabling acknowledges both the durable preference and the initial sync. */
internal suspend fun enableHealthConnectDurably(
  enabled: Boolean,
  supported: () -> Boolean,
  permissionsGranted: suspend () -> Boolean,
  read: () -> Boolean,
  persist: (Boolean) -> Unit,
  sync: suspend () -> Boolean,
) {
  if (enabled && !supported()) throw HealthConnectOperationFailure("unavailable", "Health Connect is unavailable")
  if (enabled && !permissionsGranted()) throw HealthConnectOperationFailure("not-authorized", "Health Connect permissions are required")
  val previous = read()
  persist(enabled)
  if (enabled) {
    try {
      if (!sync()) throw HealthConnectOperationFailure("unavailable", "Health Connect initial sync failed")
    } catch (failure: Exception) {
      runCatching { persist(previous) }.onFailure { failure.addSuppressed(it) }
      throw failure
    }
  }
}
