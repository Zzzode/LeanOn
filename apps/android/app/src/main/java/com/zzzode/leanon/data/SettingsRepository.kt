package com.zzzode.leanon.data

import android.content.Context
import com.zzzode.leanon.reminders.ReminderSettings
import com.zzzode.leanon.reminders.ReminderSlot

/**
 * App preferences backed by SharedPreferences (RFC 0020), separate from the
 * health records. Missing values fall back to the same defaults as core.
 */
class SettingsRepository(context: Context) {

  private val prefs =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun getReminderSettings(): ReminderSettings =
    ReminderSettings(
      weight = ReminderSlot(
        enabled = prefs.getBoolean(KEY_WEIGHT_ENABLED, true),
        hour = prefs.getInt(KEY_WEIGHT_HOUR, 7),
        minute = prefs.getInt(KEY_WEIGHT_MINUTE, 30),
      ),
      meals = ReminderSlot(
        enabled = prefs.getBoolean(KEY_MEALS_ENABLED, true),
        hour = prefs.getInt(KEY_MEALS_HOUR, 21),
        minute = prefs.getInt(KEY_MEALS_MINUTE, 0),
      ),
    )

  fun setReminderSettings(settings: ReminderSettings) {
    prefs.edit()
      .putBoolean(KEY_WEIGHT_ENABLED, settings.weight.enabled)
      .putInt(KEY_WEIGHT_HOUR, settings.weight.hour)
      .putInt(KEY_WEIGHT_MINUTE, settings.weight.minute)
      .putBoolean(KEY_MEALS_ENABLED, settings.meals.enabled)
      .putInt(KEY_MEALS_HOUR, settings.meals.hour)
      .putInt(KEY_MEALS_MINUTE, settings.meals.minute)
      .apply()
  }

  fun getHealthConnectEnabled(): Boolean =
    prefs.getBoolean(KEY_HEALTH_CONNECT_ENABLED, false)

  fun setHealthConnectEnabled(enabled: Boolean) {
    prefs.edit().putBoolean(KEY_HEALTH_CONNECT_ENABLED, enabled).apply()
  }

  /** Epoch ms of the last successful two-way sync; 0 means never (RFC 0025). */
  fun getLastSyncEpochMs(): Long = prefs.getLong(KEY_HEALTH_CONNECT_LAST_SYNC, 0L)

  fun setLastSyncEpochMs(epochMs: Long) {
    prefs.edit().putLong(KEY_HEALTH_CONNECT_LAST_SYNC, epochMs).apply()
  }

  private companion object {
    const val PREFS_NAME = "leanon_settings"
    const val KEY_HEALTH_CONNECT_ENABLED = "health_connect_enabled"
    const val KEY_HEALTH_CONNECT_LAST_SYNC = "health_connect_last_sync"
    const val KEY_WEIGHT_ENABLED = "weight_enabled"
    const val KEY_WEIGHT_HOUR = "weight_hour"
    const val KEY_WEIGHT_MINUTE = "weight_minute"
    const val KEY_MEALS_ENABLED = "meals_enabled"
    const val KEY_MEALS_HOUR = "meals_hour"
    const val KEY_MEALS_MINUTE = "meals_minute"
  }
}
