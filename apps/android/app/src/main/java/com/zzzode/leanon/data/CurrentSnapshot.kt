package com.zzzode.leanon.data

import org.json.JSONObject
import java.time.Clock
import java.time.LocalDate
import java.time.ZonedDateTime

/** Derive presentation metadata from records and the current local calendar, without a disk write. */
internal fun currentSnapshot(data: JSONObject, clock: Clock): JSONObject {
  val snapshot = JSONObject(data.toString())
  val now = ZonedDateTime.now(clock)
  val today = now.toLocalDate()
  val dates = mutableSetOf<LocalDate>()
  for (key in listOf("weights", "intake", "exercises", "water")) {
    val records = data.optJSONArray(key) ?: continue
    for (index in 0 until records.length()) {
      val record = records.optJSONObject(index) ?: continue
      val valueKey = when (key) {
        "weights" -> "weightKg"
        "intake" -> "kcal"
        "exercises" -> "durationMin"
        else -> "amountMl"
      }
      val value = record.optDouble(valueKey, 0.0)
      if (!value.isFinite() || value <= 0) continue
      val date = runCatching { LocalDate.parse(record.optString("date")) }.getOrNull() ?: continue
      if (!date.isAfter(today)) dates.add(date)
    }
  }
  var cursor = if (today in dates) today else today.minusDays(1)
  var streak = 0
  while (cursor in dates) { streak++; cursor = cursor.minusDays(1) }
  return snapshot.put("today", today.toString()).put("todayHour", now.hour).put("streak", streak)
}
