package com.zzzode.leanon.modules

import com.lynx.react.bridge.ReadableMap
import com.lynx.react.bridge.ReadableType
import java.time.LocalDate
import java.time.format.DateTimeParseException

internal class InvalidRecordRequest(message: String) : Exception(message)

/** Validate the JS value's actual type before calling a Lynx typed getter. */
internal object RecordRequest {
  fun string(params: ReadableMap, key: String): String {
    if (!params.hasKey(key) || params.getType(key) != ReadableType.String) {
      throw InvalidRecordRequest("Missing or invalid $key")
    }
    return params.getString(key)?.takeIf { it.isNotBlank() }
      ?: throw InvalidRecordRequest("Missing or invalid $key")
  }

  fun date(params: ReadableMap): String {
    val value = string(params, "date")
    if (!value.matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}"))) {
      throw InvalidRecordRequest("Invalid date")
    }
    try {
      if (LocalDate.parse(value).year < 1 || LocalDate.parse(value).toString() != value) throw InvalidRecordRequest("Invalid date")
    } catch (_: DateTimeParseException) {
      throw InvalidRecordRequest("Invalid date")
    }
    return value
  }

  fun number(params: ReadableMap, key: String, positive: Boolean = false, default: Double? = null): Double {
    if (!params.hasKey(key) && default != null) return default
    if (!params.hasKey(key) || params.getType(key) !in listOf(ReadableType.Number, ReadableType.Int, ReadableType.Long)) {
      throw InvalidRecordRequest("Missing or invalid $key")
    }
    val value = params.getDouble(key)
    if (!value.isFinite() || (if (positive) value <= 0 else value < 0)) {
      throw InvalidRecordRequest("Invalid $key")
    }
    return value
  }

  fun duration(params: ReadableMap): Double {
    val value = number(params, "durationMin", positive = true)
    if (value < 1.0 || value > 1440.0) throw InvalidRecordRequest("Duration must be between 1 and 1440 minutes")
    return value
  }

  fun integer(params: ReadableMap, key: String, range: IntRange): Int {
    val value = number(params, key)
    if (value % 1.0 != 0.0 || value < range.first || value > range.last) {
      throw InvalidRecordRequest("Invalid $key")
    }
    return value.toInt()
  }

  fun boolean(params: ReadableMap, key: String): Boolean {
    if (!params.hasKey(key) || params.getType(key) != ReadableType.Boolean) {
      throw InvalidRecordRequest("Missing or invalid $key")
    }
    return params.getBoolean(key)
  }

  fun map(params: ReadableMap, key: String): ReadableMap {
    if (!params.hasKey(key) || params.getType(key) != ReadableType.Map) {
      throw InvalidRecordRequest("Missing or invalid $key")
    }
    return params.getMap(key) ?: throw InvalidRecordRequest("Invalid $key")
  }
}
