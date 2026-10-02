package com.zzzode.leanon.modules

import android.app.Activity
import android.content.Context
import androidx.core.app.ActivityCompat
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.react.bridge.ReadableMap
import com.lynx.tasm.behavior.LynxContext
import com.zzzode.leanon.LeanOnApplication
import com.zzzode.leanon.reminders.NotificationPermission
import com.zzzode.leanon.reminders.ReminderSettings
import com.zzzode.leanon.reminders.ReminderSlot
import com.zzzode.leanon.reminders.toJavaOnlyMap

/** Native module backing the `notification.*` methods (RFC 0020). */
class NotificationModule(context: Context) : LynxModule(context) {

  private val moduleContext: Context = context

  private fun androidContext(): Context =
    (moduleContext as? LynxContext)?.getContext() ?: moduleContext

  private fun app(): LeanOnApplication =
    androidContext().applicationContext as LeanOnApplication

  private fun activity(): Activity? = androidContext() as? Activity

  @LynxMethod
  fun getSettings(callback: Callback) {
    val settings = app().settings.getReminderSettings()
    val result = JavaOnlyMap()
    result.putMap("settings", settings.toJavaOnlyMap())
    callback.invoke(result)
  }

  @LynxMethod
  fun updateSettings(params: ReadableMap, callback: Callback) {
    try {
      val settings = parseSettings(params)
      app().settings.setReminderSettings(settings)
      app().reminderScheduler.applySettings(settings)
      val result = JavaOnlyMap()
      result.putBoolean("success", true)
      result.putMap("settings", settings.toJavaOnlyMap())
      callback.invoke(result)
    } catch (error: Exception) {
      callback.invoke(
        errorResult("invalid-request", error.message ?: "Invalid reminder settings"),
      )
    }
  }

  @LynxMethod
  fun requestPermission(callback: Callback) {
    if (NotificationPermission.areGranted(androidContext())) {
      callback.invoke(grantedResult(true))
      return
    }
    val currentActivity = activity()
    if (currentActivity == null) {
      callback.invoke(grantedResult(false))
      return
    }
    NotificationPermission.onResult = { granted ->
      callback.invoke(grantedResult(granted))
    }
    ActivityCompat.requestPermissions(
      currentActivity,
      NotificationPermission.required(),
      NotificationPermission.REQUEST_CODE,
    )
  }

  private fun parseSettings(params: ReadableMap): ReminderSettings {
    val root = params.getMap("settings")
      ?: throw IllegalArgumentException("Missing settings")
    return ReminderSettings(
      weight = parseSlot(root.getMap("weight")),
      meals = parseSlot(root.getMap("meals")),
    )
  }

  private fun parseSlot(map: ReadableMap?): ReminderSlot {
    if (map == null) throw IllegalArgumentException("Missing reminder slot")
    val enabled = map.getBoolean("enabled")
    val hour = map.getInt("hour")
    val minute = map.getInt("minute")
    if (hour !in 0..23 || minute !in 0..59) {
      throw IllegalArgumentException("Reminder time out of range")
    }
    return ReminderSlot(enabled, hour, minute)
  }

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
