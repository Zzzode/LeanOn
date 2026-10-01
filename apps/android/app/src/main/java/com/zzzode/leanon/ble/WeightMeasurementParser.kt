package com.zzzode.leanon.ble

import kotlin.math.roundToLong

/**
 * A weight decoded from the standard GATT Weight Measurement characteristic
 * (`0x2A9D`). This slice decodes the unit and weight; the optional timestamp,
 * user ID and BMI fields are not needed to log today's weight.
 */
data class ParsedWeight(val weightKg: Double)

/**
 * Parses the Bluetooth SIG Weight Measurement value. This is pure JVM logic so
 * it can be unit-tested without Bluetooth hardware (see RFC 0011).
 *
 * Layout: byte 0 flags (bit 0: 0 = SI, 1 = Imperial); bytes 1-2 weight as a
 * little-endian uint16. SI resolution is 0.005 kg; Imperial resolution is
 * 0.01 lb, which is converted to kilograms.
 */
object WeightMeasurementParser {

  private const val FLAG_IMPERIAL = 0x01
  private const val SI_RESOLUTION_KG = 0.005
  private const val IMPERIAL_RESOLUTION_LB = 0.01
  private const val LB_TO_KG = 0.45359237
  private const val MIN_LENGTH = 3

  /** Parse [value]; returns null when the payload is too short to hold a weight. */
  fun parse(value: ByteArray): ParsedWeight? {
    if (value.size < MIN_LENGTH) return null

    val flags = value[0].asUnsignedInt()
    val rawWeight =
      (value[1].asUnsignedInt()) or (value[2].asUnsignedInt() shl 8)

    val weightKg =
      if (flags and FLAG_IMPERIAL != 0) {
        rawWeight * IMPERIAL_RESOLUTION_LB * LB_TO_KG
      } else {
        rawWeight * SI_RESOLUTION_KG
      }

    return ParsedWeight(roundToOneDecimal(weightKg))
  }

  private fun Byte.asUnsignedInt(): Int = toInt() and 0xFF

  private fun roundToOneDecimal(value: Double): Double =
    (value * 10).roundToLong() / 10.0
}
