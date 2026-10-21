package com.zzzode.leanon.modules

import com.lynx.react.bridge.ReadableMap
import com.zzzode.leanon.reminders.ReminderSettings
import com.zzzode.leanon.reminders.ReminderSlot

internal fun parseReminderSettings(params: ReadableMap): ReminderSettings {
  val root = RecordRequest.map(params, "settings")
  fun slot(key: String): ReminderSlot {
    val value = RecordRequest.map(root, key)
    return ReminderSlot(
      RecordRequest.boolean(value, "enabled"),
      RecordRequest.integer(value, "hour", 0..23),
      RecordRequest.integer(value, "minute", 0..59),
    )
  }
  return ReminderSettings(weight = slot("weight"), meals = slot("meals"))
}
