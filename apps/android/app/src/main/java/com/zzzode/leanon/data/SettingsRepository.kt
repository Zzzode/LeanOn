package com.zzzode.leanon.data

import android.content.Context
import com.zzzode.leanon.reminders.ReminderSettings
import com.zzzode.leanon.reminders.ReminderSlot
import org.json.JSONObject
import java.io.File
import java.io.IOException

/**
 * App preferences in an atomic private snapshot, separate from health records.
 * Legacy SharedPreferences are imported on the first successful write.
 */
class SettingsRepository internal constructor(
  private val file: File,
  private val legacy: () -> JSONObject = { JSONObject() },
  private val persist: (File, String) -> Unit = ::writeRecordsAtomically,
) {
  constructor(context: Context) : this(
    File(context.applicationContext.filesDir, "settings.json"),
    { legacySettings(context.applicationContext) },
  )

  @Synchronized
  fun getReminderSettings(): ReminderSettings {
    val value = read()
    return ReminderSettings(
      weight = ReminderSlot(
        enabled = value.optBoolean(KEY_WEIGHT_ENABLED, true),
        hour = value.optInt(KEY_WEIGHT_HOUR, 7),
        minute = value.optInt(KEY_WEIGHT_MINUTE, 30),
      ),
      meals = ReminderSlot(
        enabled = value.optBoolean(KEY_MEALS_ENABLED, true),
        hour = value.optInt(KEY_MEALS_HOUR, 21),
        minute = value.optInt(KEY_MEALS_MINUTE, 0),
      ),
    )
  }

  @Synchronized
  fun setReminderSettings(settings: ReminderSettings) {
    require(settings.weight.hour in 0..23 && settings.meals.hour in 0..23 &&
      settings.weight.minute in 0..59 && settings.meals.minute in 0..59)
    update {
      it.put(KEY_WEIGHT_ENABLED, settings.weight.enabled).put(KEY_WEIGHT_HOUR, settings.weight.hour)
        .put(KEY_WEIGHT_MINUTE, settings.weight.minute).put(KEY_MEALS_ENABLED, settings.meals.enabled)
        .put(KEY_MEALS_HOUR, settings.meals.hour).put(KEY_MEALS_MINUTE, settings.meals.minute)
    }
  }

  @Synchronized
  fun getHealthConnectEnabled(): Boolean = read().optBoolean(KEY_HEALTH_CONNECT_ENABLED, false)

  @Synchronized
  fun setHealthConnectEnabled(enabled: Boolean) = update { it.put(KEY_HEALTH_CONNECT_ENABLED, enabled) }

  /** Epoch ms of the last successful two-way sync; 0 means never (RFC 0025). */
  @Synchronized
  fun getLastSyncEpochMs(): Long = read().optLong(KEY_HEALTH_CONNECT_LAST_SYNC, 0L)

  @Synchronized
  fun setLastSyncEpochMs(epochMs: Long) {
    require(epochMs >= 0)
    update { it.put(KEY_HEALTH_CONNECT_LAST_SYNC, epochMs) }
  }

  private fun update(change: (JSONObject) -> Unit) {
    val value = read()
    change(value)
    persist(file, value.toString())
  }

  private fun read(): JSONObject = try {
    // Import legacy settings on the first successful write; never erase them or
    // replace an established corrupt file with defaults. Reads do not migrate.
    val value = if (file.exists()) JSONObject(file.readText(Charsets.UTF_8)) else JSONObject(legacy().toString())
    validate(value)
    value
  } catch (error: Exception) {
    throw IOException("Could not read persisted settings", error)
  }

  private fun validate(value: JSONObject) {
    for (key in listOf(KEY_WEIGHT_ENABLED, KEY_MEALS_ENABLED, KEY_HEALTH_CONNECT_ENABLED)) {
      if (value.has(key) && value.get(key) !is Boolean) throw IOException("Invalid setting $key")
    }
    for ((key, maximum) in listOf(KEY_WEIGHT_HOUR to 23L, KEY_MEALS_HOUR to 23L,
      KEY_WEIGHT_MINUTE to 59L, KEY_MEALS_MINUTE to 59L, KEY_HEALTH_CONNECT_LAST_SYNC to Long.MAX_VALUE)) {
      if (!value.has(key)) continue
      val raw = value.get(key)
      if ((raw !is Int && raw !is Long) || (raw as Number).toLong() !in 0..maximum) {
        throw IOException("Invalid setting $key")
      }
    }
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

    fun legacySettings(context: Context): JSONObject {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      return JSONObject()
        .put(KEY_WEIGHT_ENABLED, prefs.getBoolean(KEY_WEIGHT_ENABLED, true))
        .put(KEY_WEIGHT_HOUR, prefs.getInt(KEY_WEIGHT_HOUR, 7))
        .put(KEY_WEIGHT_MINUTE, prefs.getInt(KEY_WEIGHT_MINUTE, 30))
        .put(KEY_MEALS_ENABLED, prefs.getBoolean(KEY_MEALS_ENABLED, true))
        .put(KEY_MEALS_HOUR, prefs.getInt(KEY_MEALS_HOUR, 21))
        .put(KEY_MEALS_MINUTE, prefs.getInt(KEY_MEALS_MINUTE, 0))
        .put(KEY_HEALTH_CONNECT_ENABLED, prefs.getBoolean(KEY_HEALTH_CONNECT_ENABLED, false))
        .put(KEY_HEALTH_CONNECT_LAST_SYNC, prefs.getLong(KEY_HEALTH_CONNECT_LAST_SYNC, 0L))
    }
  }
}
