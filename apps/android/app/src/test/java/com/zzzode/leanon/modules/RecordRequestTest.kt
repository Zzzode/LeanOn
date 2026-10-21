package com.zzzode.leanon.modules

import com.lynx.react.bridge.JavaOnlyMap
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class RecordRequestTest {
  private fun map(key: String, value: Any?): JavaOnlyMap = JavaOnlyMap.from(mapOf(key to value))
  @Test fun datesMustBeRealCalendarDates() {
    assertEquals("2024-02-29", RecordRequest.date(map("date", "2024-02-29")))
    for (value in listOf("", " ", "2026-02-30", "0000-01-01", "2026-2-03", "2026-13-01", "2026-01-01T00:00:00Z")) {
      assertThrows(InvalidRecordRequest::class.java) { RecordRequest.date(map("date", value)) }
    }
  }

  @Test fun wrongTypesAndNullAreValidationErrorsBeforeTypedGetters() {
    for (value in listOf<Any?>(null, true, "250", JavaOnlyMap())) {
      assertThrows(InvalidRecordRequest::class.java) {
        RecordRequest.number(map("amountMl", value), "amountMl")
      }
    }
    assertThrows(InvalidRecordRequest::class.java) { RecordRequest.string(map("id", 7), "id") }
    assertThrows(InvalidRecordRequest::class.java) { RecordRequest.string(map("id", "  "), "id") }
    assertThrows(InvalidRecordRequest::class.java) { RecordRequest.boolean(map("favorite", 1), "favorite") }
    assertThrows(InvalidRecordRequest::class.java) { RecordRequest.map(map("macros", "bad"), "macros") }
  }

  @Test fun waterSupportsZeroAndUnboundedFinitePositiveTotals() {
    assertEquals(0.0, RecordRequest.number(map("amountMl", 0.0), "amountMl"), 0.0)
    assertEquals(250.0, RecordRequest.number(map("amountMl", 250), "amountMl"), 0.0)
    assertEquals(250.0, RecordRequest.number(map("amountMl", 250L), "amountMl"), 0.0)
    assertEquals(10000.0, RecordRequest.number(map("amountMl", 10000.0), "amountMl"), 0.0)
    for (value in listOf(-1.0, Double.NaN, Double.POSITIVE_INFINITY)) {
      assertThrows(InvalidRecordRequest::class.java) { RecordRequest.number(map("amountMl", value), "amountMl") }
    }
  }

  @Test fun optionalNutrientsDefaultOnlyWhenAbsent() {
    assertEquals(0.0, RecordRequest.number(JavaOnlyMap(), "fiberG", default = 0.0), 0.0)
    assertThrows(InvalidRecordRequest::class.java) {
      RecordRequest.number(map("fiberG", null), "fiberG", default = 0.0)
    }
    assertThrows(InvalidRecordRequest::class.java) { RecordRequest.number(map("kcal", 0.0), "kcal", positive = true) }
    assertEquals("unknown-food", RecordRequest.string(map("id", "unknown-food"), "id"))
  }

  @Test fun exerciseDurationMatchesTheSharedOneDayBoundsAndAllowsFractions() {
    for (value in listOf(1.0, 30.5, 1440.0)) assertEquals(value, RecordRequest.duration(map("durationMin", value)), 0.0)
    for (value in listOf(0.5, 1440.1, Double.NaN)) {
      assertThrows(InvalidRecordRequest::class.java) { RecordRequest.duration(map("durationMin", value)) }
    }
  }
}
