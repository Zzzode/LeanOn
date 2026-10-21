package com.zzzode.leanon.appearance

import android.app.UiModeManager
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import androidx.appcompat.app.AppCompatDelegate

internal fun systemAppearanceIsDark(nightMode: Int, configurationUiMode: Int): Boolean =
  when (nightMode) {
    UiModeManager.MODE_NIGHT_YES -> true
    UiModeManager.MODE_NIGHT_NO -> false
    else -> configurationUiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
  }

/** Theme preferences are independent of local health records and reminder settings. */
class AppearanceRepository(context: Context) {
  private val appContext = context.applicationContext
  private val prefs = appContext.getSharedPreferences("leanon-appearance", Context.MODE_PRIVATE)
  private val store = AppearancePreferenceStore(
    read = { prefs.getString("preference", null) },
    write = { prefs.edit().putString("preference", it).commit() },
  )

  fun preference(): AppearancePreference = store.preference()

  fun save(value: String?): Boolean = store.save(value)

  fun resolved(): String {
    // Resources.getSystem() is not an application/display-configured resource
    // set and can report UI_MODE_NIGHT_UNDEFINED. Read the system mode manager
    // for explicit modes, then the app configuration for scheduled/auto mode.
    val systemDark = systemAppearanceIsDark(
      appContext.getSystemService(UiModeManager::class.java).nightMode,
      appContext.resources.configuration.uiMode,
    )
    return preference().resolve(systemDark)
  }

  fun snapshot(): Map<String, String> = mapOf(
    "preference" to preference().value,
    "resolved" to resolved(),
  )

  /** Apply before activity inflation. API 31+ persists the launch/splash override. */
  fun applyPlatformPreference() {
    if (Build.VERSION.SDK_INT >= 31) {
      val mode = when (preference()) {
        AppearancePreference.SYSTEM -> UiModeManager.MODE_NIGHT_AUTO
        AppearancePreference.LIGHT -> UiModeManager.MODE_NIGHT_NO
        AppearancePreference.DARK -> UiModeManager.MODE_NIGHT_YES
      }
      // AUTO clears the application's uiMode override; the system then supplies
      // the actual configuration, including scheduled and battery-saver changes.
      appContext.getSystemService(UiModeManager::class.java).setApplicationNightMode(mode)
    } else {
      val mode = when (preference()) {
        AppearancePreference.SYSTEM -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        AppearancePreference.LIGHT -> AppCompatDelegate.MODE_NIGHT_NO
        AppearancePreference.DARK -> AppCompatDelegate.MODE_NIGHT_YES
      }
      AppCompatDelegate.setDefaultNightMode(mode)
    }
  }

  /** Resolve resources immediately, before an asynchronous platform configuration arrives. */
  fun themedContext(context: Context): Context {
    val configuration = Configuration(context.resources.configuration)
    configuration.uiMode = (configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or
      if (resolved() == "dark") Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO
    return context.createConfigurationContext(configuration)
  }
}
