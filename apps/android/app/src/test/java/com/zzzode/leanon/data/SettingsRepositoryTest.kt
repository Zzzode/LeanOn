package com.zzzode.leanon.data

import com.zzzode.leanon.reminders.ReminderSettings
import com.zzzode.leanon.reminders.ReminderSlot
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.IOException
import java.util.concurrent.Callable
import java.util.concurrent.Executors

class SettingsRepositoryTest {
  @get:Rule val temporary = TemporaryFolder()
  private fun file() = temporary.root.resolve("settings.json")
  private fun settings() = ReminderSettings(ReminderSlot(false, 8, 15), ReminderSlot(true, 20, 45))

  @Test fun defaultsAreReadOnlyAndMatchExistingPreferences() {
    val store = SettingsRepository(file())
    assertEquals(ReminderSettings(ReminderSlot(true, 7, 30), ReminderSlot(true, 21, 0)), store.getReminderSettings())
    assertFalse(store.getHealthConnectEnabled())
    assertEquals(0L, store.getLastSyncEpochMs())
    assertFalse(file().exists())
  }

  @Test fun firstSuccessfulWriteImportsLegacyWithoutMutatingIt() {
    val legacy = JSONObject().put("weight_enabled", false).put("weight_hour", 9)
      .put("weight_minute", 10).put("health_connect_enabled", true)
      .put("health_connect_last_sync", 123L).put("future_setting", "preserve")
    val before = legacy.toString()
    val store = SettingsRepository(file(), legacy = { legacy })
    assertEquals(9, store.getReminderSettings().weight.hour)
    assertFalse(file().exists())
    store.setReminderSettings(settings())
    assertEquals(before, legacy.toString())
    val reopened = SettingsRepository(file(), legacy = { error("Legacy must not be reread after migration") })
    assertEquals(settings(), reopened.getReminderSettings())
    assertTrue(reopened.getHealthConnectEnabled())
    assertEquals(123L, reopened.getLastSyncEpochMs())
    assertEquals("preserve", JSONObject(file().readText()).getString("future_setting"))
  }

  @Test fun failedFirstWriteKeepsLegacyAndCreatesNoSavedState() {
    val legacy = JSONObject().put("health_connect_enabled", false)
    val store = SettingsRepository(file(), { legacy }, persist = { _, _ -> throw IOException("Disk full") })
    assertThrows(IOException::class.java) { store.setHealthConnectEnabled(true) }
    assertFalse(store.getHealthConnectEnabled())
    assertFalse(file().exists())
    assertFalse(legacy.getBoolean("health_connect_enabled"))
  }

  @Test fun failedWritesPreserveAllThreeSettingsKindsAcrossRestart() {
    val store = SettingsRepository(file())
    store.setReminderSettings(settings()); store.setHealthConnectEnabled(true); store.setLastSyncEpochMs(123)
    val before = file().readText()
    val failing = SettingsRepository(file(), persist = { _, _ -> throw IOException("Disk full") })
    assertThrows(IOException::class.java) { failing.setReminderSettings(ReminderSettings(ReminderSlot(true, 1, 0), ReminderSlot(false, 1, 0))) }
    assertThrows(IOException::class.java) { failing.setHealthConnectEnabled(false) }
    assertThrows(IOException::class.java) { failing.setLastSyncEpochMs(456) }
    assertEquals(before, file().readText())
    assertEquals(settings(), failing.getReminderSettings())
    val reopened = SettingsRepository(file())
    assertTrue(reopened.getHealthConnectEnabled()); assertEquals(123L, reopened.getLastSyncEpochMs())
  }

  @Test fun corruptEstablishedFileIsPreservedAndNeverReplacedByLegacy() {
    file().writeText("{broken")
    val store = SettingsRepository(file(), legacy = { JSONObject().put("health_connect_enabled", true) })
    assertThrows(IOException::class.java) { store.getReminderSettings() }
    assertThrows(IOException::class.java) { store.setHealthConnectEnabled(true) }
    assertEquals("{broken", file().readText())
  }

  @Test fun wrongTypesAndOutOfRangeStoredSettingsAreExplicitFailures() {
    for (text in listOf("{\"weight_enabled\":\"true\"}", "{\"weight_hour\":24}",
      "{\"meals_minute\":1.5}", "{\"health_connect_last_sync\":-1}", "{\"health_connect_enabled\":null}")) {
      file().writeText(text)
      val store = SettingsRepository(file())
      assertThrows(IOException::class.java) { store.getHealthConnectEnabled() }
      assertThrows(IOException::class.java) { store.setLastSyncEpochMs(123) }
      assertEquals(text, file().readText())
    }
  }

  @Test fun invalidSetterValuesDoNotCreateAFile() {
    val store = SettingsRepository(file())
    assertThrows(IllegalArgumentException::class.java) { store.setLastSyncEpochMs(-1) }
    assertThrows(IllegalArgumentException::class.java) {
      store.setReminderSettings(ReminderSettings(ReminderSlot(true, 25, 0), ReminderSlot(false, 1, 0)))
    }
    assertFalse(file().exists())
  }

  @Test fun concurrentKindsNeverLoseEachOthersFields() {
    val store = SettingsRepository(file())
    val executor = Executors.newFixedThreadPool(3)
    try {
      executor.invokeAll(listOf(
        Callable { repeat(30) { store.setReminderSettings(settings()) } },
        Callable { repeat(30) { store.setHealthConnectEnabled(true) } },
        Callable { repeat(30) { store.setLastSyncEpochMs(it.toLong()) } },
      )).forEach { it.get() }
    } finally { executor.shutdown() }
    val reopened = SettingsRepository(file())
    assertEquals(settings(), reopened.getReminderSettings())
    assertTrue(reopened.getHealthConnectEnabled())
    assertEquals(29L, reopened.getLastSyncEpochMs())
  }
}
