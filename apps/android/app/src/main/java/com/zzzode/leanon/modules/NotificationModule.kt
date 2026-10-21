package com.zzzode.leanon.modules

import android.app.Activity
import android.content.Context
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.react.bridge.ReadableMap
import com.lynx.tasm.behavior.LynxContext
import com.zzzode.leanon.LeanOnApplication
import com.zzzode.leanon.reminders.NotificationPermission
import com.zzzode.leanon.reminders.ReminderSettings
import com.zzzode.leanon.reminders.toJavaOnlyMap
import com.zzzode.leanon.reminders.updateReminderSettingsDurably
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** Native module backing the `notification.*` methods (RFC 0020). */
class NotificationModule(context: Context) : LynxModule(context) {

  private val moduleContext: Context = context
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  private fun androidContext(): Context =
    (moduleContext as? LynxContext)?.getContext() ?: moduleContext

  private fun app(): LeanOnApplication =
    androidContext().applicationContext as LeanOnApplication

  private fun activity(): Activity? = androidContext() as? Activity

  @LynxMethod
  @Suppress("UNUSED_PARAMETER")
  fun getSettings(params: ReadableMap?, callback: Callback) {
    scope.launch {
      val result = try {
        JavaOnlyMap().apply { putMap("settings", app().settings.getReminderSettings().toJavaOnlyMap()) }
      } catch (_: Exception) { errorResult("unavailable", "Unable to read reminder settings") }
      callback.invoke(result)
    }
  }

  @LynxMethod
  fun updateSettings(params: ReadableMap, callback: Callback) {
    val settings = try { parseReminderSettings(params) } catch (error: InvalidRecordRequest) {
      callback.invoke(errorResult("invalid-request", error.message ?: "Invalid reminder settings"))
      return
    }
    scope.launch {
      val result = try {
        synchronized(SETTINGS_LOCK) {
          val enabling = settings.weight.enabled || settings.meals.enabled
          if (enabling && (!NotificationPermission.areGranted(androidContext()) ||
              !NotificationManagerCompat.from(androidContext()).areNotificationsEnabled())) {
            errorResult("not-authorized", "Notification permission is required to enable reminders")
          } else {
            val application = app()
            updateReminderSettingsDurably(settings, application.settings::getReminderSettings,
              application.settings::setReminderSettings, application.reminderScheduler::applySettingsAndAwait)
            JavaOnlyMap().apply {
              putBoolean("success", true)
              putMap("settings", settings.toJavaOnlyMap())
            }
          }
        }
      } catch (_: Exception) { errorResult("unavailable", "Unable to persist or schedule reminders") }
      callback.invoke(result)
    }
  }

  @LynxMethod
  @Suppress("UNUSED_PARAMETER")
  fun requestPermission(params: ReadableMap?, callback: Callback) {
    if (NotificationPermission.areGranted(androidContext())) {
      callback.invoke(grantedResult(true))
      return
    }
    val currentActivity = activity()
    if (currentActivity == null) {
      callback.invoke(grantedResult(false))
      return
    }
    currentActivity.runOnUiThread {
      if (!NotificationPermission.begin { granted -> callback.invoke(grantedResult(granted)) }) {
        callback.invoke(errorResult("unavailable", "Notification permission request already pending"))
        return@runOnUiThread
      }
      try {
        ActivityCompat.requestPermissions(currentActivity, NotificationPermission.required(), NotificationPermission.REQUEST_CODE)
      } catch (_: Exception) { NotificationPermission.cancel() }
    }
  }

  private companion object { val SETTINGS_LOCK = Any() }

  private fun grantedResult(granted: Boolean): JavaOnlyMap {
    val map = JavaOnlyMap()
    map.putBoolean("granted", granted)
    return map
  }

  private fun errorResult(code: String, message: String): JavaOnlyMap {
    val map = JavaOnlyMap()
    map.putString("code", code)
    map.putString("message", message)
    return map
  }
}
