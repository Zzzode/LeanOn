package com.zzzode.leanon.ble

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WeightMeasurementParserTest {

  @Test
  fun parsesSiWeight() {
    // 70.0 kg -> 70.0 / 0.005 = 14000 = 0x36B0 (little-endian B0 36).
    val result = WeightMeasurementParser.parse(
      byteArrayOf(0x00, 0xB0.toByte(), 0x36),
    )
    assertEquals(70.0, result?.weightKg!!, 0.0001)
  }

  @Test
  fun parsesFractionalSiWeight() {
    // 61.3 kg -> 12260 = 0x2FE4 (E4 2F).
    val result = WeightMeasurementParser.parse(
      byteArrayOf(0x00, 0xE4.toByte(), 0x2F),
    )
    assertEquals(61.3, result?.weightKg!!, 0.0001)
  }

  @Test
  fun parsesImperialWeightAndConvertsToKg() {
    // 100 lb -> 10000 = 0x2710 (10 27); 100 lb = 45.359 kg -> 45.4.
    val result = WeightMeasurementParser.parse(
      byteArrayOf(0x01, 0x10, 0x27),
    )
    assertEquals(45.4, result?.weightKg!!, 0.0001)
  }

  @Test
  fun parsesImperialWeightWithFraction() {
    // 135 lb -> 13500 = 0x34BC (BC 34); 135 lb = 61.235 kg -> 61.2.
    val result = WeightMeasurementParser.parse(
      byteArrayOf(0x01, 0xBC.toByte(), 0x34),
    )
    assertEquals(61.2, result?.weightKg!!, 0.0001)
  }

  @Test
  fun ignoresOptionalTrailingFields() {
    // SI 70.0 kg with timestamp/user-id/BMI flag bits set and trailing bytes.
    val result = WeightMeasurementParser.parse(
      byteArrayOf(0x0E, 0xB0.toByte(), 0x36, 0x00, 0x00, 0x01),
    )
    assertEquals(70.0, result?.weightKg!!, 0.0001)
  }

  @Test
  fun returnsNullForTooShortPayload() {
    assertNull(WeightMeasurementParser.parse(byteArrayOf(0x00, 0xB0.toByte())))
  }
}
