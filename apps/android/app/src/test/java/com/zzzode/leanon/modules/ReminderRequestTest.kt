package com.zzzode.leanon.modules

import com.lynx.react.bridge.JavaOnlyMap
import org.junit.Assert.*
import org.junit.Test

class ReminderRequestTest {
  private fun request(hour: Any? = 7, enabled: Any? = true): JavaOnlyMap {
    val slot = JavaOnlyMap.from(mapOf("enabled" to enabled, "hour" to hour, "minute" to 30))
    return JavaOnlyMap().apply { putMap("settings", JavaOnlyMap().apply { putMap("weight", slot); putMap("meals", slot) }) }
  }

  @Test fun numericFractionsStringsNullAndWrongBooleansAreRejected() {
    for (hour in listOf(7.5, "7", null, -1, 24, Double.POSITIVE_INFINITY)) {
      assertThrows(InvalidRecordRequest::class.java) { parseReminderSettings(request(hour)) }
    }
    for (enabled in listOf(1, "true", null)) {
      assertThrows(InvalidRecordRequest::class.java) { parseReminderSettings(request(enabled = enabled)) }
    }
  }

  @Test fun validDisabledAndEdgeTimesRemainAvailable() {
    assertEquals(0, parseReminderSettings(request(0)).weight.hour)
    assertEquals(23, parseReminderSettings(request(23)).weight.hour)
    assertFalse(parseReminderSettings(request(enabled = false)).meals.enabled)
  }
}
