package com.zzzode.leanon.reminders

import com.lynx.react.bridge.JavaOnlyMap

/**
 * Host mirror of core's ReminderSettings (RFC 0020). Times are local; the
 * settings are persisted by SettingsRepository and never enter health records.
 */
data class ReminderSlot(
  val enabled: Boolean,
  val hour: Int,
  val minute: Int,
)

data class ReminderSettings(
  val weight: ReminderSlot,
  val meals: ReminderSlot,
)

/** Serialize a slot to the JSON-friendly map that crosses the bridge. */
fun ReminderSlot.toJavaOnlyMap(): JavaOnlyMap {
  val map = JavaOnlyMap()
  map.putBoolean("enabled", enabled)
  map.putInt("hour", hour)
  map.putInt("minute", minute)
  return map
}

/** Serialize the full settings to the JSON-friendly map that crosses the bridge. */
fun ReminderSettings.toJavaOnlyMap(): JavaOnlyMap {
  val map = JavaOnlyMap()
  map.putMap("weight", weight.toJavaOnlyMap())
  map.putMap("meals", meals.toJavaOnlyMap())
  return map
}
