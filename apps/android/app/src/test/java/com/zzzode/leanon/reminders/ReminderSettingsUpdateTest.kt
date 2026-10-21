package com.zzzode.leanon.reminders

import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class ReminderSettingsUpdateTest {
  private val old = ReminderSettings(ReminderSlot(false, 7, 30), ReminderSlot(false, 21, 0))
  private val next = ReminderSettings(ReminderSlot(true, 8, 0), ReminderSlot(false, 21, 0))

  @Test fun successWaitsForBothDurablePersistenceAndScheduling() {
    val order = mutableListOf<String>()
    assertEquals(next, updateReminderSettingsDurably(next, { old }, { order += "persist" }, { order += "schedule" }))
    assertEquals(listOf("persist", "schedule"), order)
  }

  @Test fun storageFailureNeverSchedules() {
    var scheduled = false
    try {
      updateReminderSettingsDurably(next, { old }, { throw IOException("Disk full") }, { scheduled = true })
      fail("Expected persistence failure")
    } catch (_: IOException) { assertFalse(scheduled) }
  }

  @Test fun partialSchedulingFailureRestoresOldPreferencesAndWork() {
    var saved = old
    val scheduled = mutableListOf<ReminderSettings>()
    try {
      updateReminderSettingsDurably(next, { saved }, { saved = it }, {
        scheduled += it
        if (it == next) throw IOException("Enqueue failed")
      })
      fail("Expected scheduling failure")
    } catch (_: IOException) { assertEquals(old, saved); assertEquals(listOf(next, old), scheduled) }
  }

  @Test fun rollbackFailuresNeverConvertFailureToSuccess() {
    try {
      updateReminderSettingsDurably(next, { old }, { if (it == old) throw IOException("Restore disk failure") }, { throw IOException("Scheduler failed") })
      fail("Expected schedule failure")
    } catch (failure: IOException) { assertEquals(2, failure.suppressed.size) }
  }
}
