package com.zzzode.leanon.reminders

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class ReminderClockTest {
  private fun local(zone: String, year: Int, month: Int, day: Int, hour: Int, minute: Int) = Calendar.getInstance(TimeZone.getTimeZone(zone)).apply {
    clear(); set(year, month - 1, day, hour, minute, 0)
  }
  @Test fun localSlotIsRecomputedForNewZoneAtSameInstant() {
    val utc = local("UTC", 2026, 10, 7, 12, 0)
    val tokyo = Calendar.getInstance(TimeZone.getTimeZone("Asia/Tokyo")).apply { timeInMillis = utc.timeInMillis }
    assertEquals(8 * 3600000L, ReminderScheduler.delayToNext(20, 0, utc))
    assertEquals(23 * 3600000L, ReminderScheduler.delayToNext(20, 0, tokyo))
  }
  @Test fun nextLocalDayAcrossDstHasTwentyThreeHours() {
    val beforeDst = local("America/New_York", 2026, 3, 7, 20, 0)
    assertEquals(23 * 3600000L, ReminderScheduler.delayToNext(20, 0, beforeDst))
  }
}
