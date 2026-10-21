package com.zzzode.leanon.appearance

/** Stable persisted values shared with the typed app bridge. */
enum class AppearancePreference(val value: String) {
  SYSTEM("system"), LIGHT("light"), DARK("dark");

  fun resolve(systemDark: Boolean): String = when (this) {
    SYSTEM -> if (systemDark) "dark" else "light"
    LIGHT -> "light"
    DARK -> "dark"
  }

  companion object {
    fun parse(value: String?): AppearancePreference? = entries.firstOrNull { it.value == value }
  }
}

/** A failed synchronous commit never announces a preference as saved. */
class AppearancePreferenceStore(
  private val read: () -> String?,
  private val write: (String) -> Boolean,
) {
  @Volatile private var committed = AppearancePreference.parse(read()) ?: AppearancePreference.SYSTEM

  fun preference(): AppearancePreference = committed

  fun save(value: String?): Boolean {
    val preference = AppearancePreference.parse(value) ?: return false
    if (!write(preference.value)) {
      // SharedPreferences updates memory even when the disk commit fails.
      // Restore its previous value too, so another repository sees the same
      // committed preference and failed requests never change current views.
      write(committed.value)
      return false
    }
    committed = preference
    return true
  }
}
