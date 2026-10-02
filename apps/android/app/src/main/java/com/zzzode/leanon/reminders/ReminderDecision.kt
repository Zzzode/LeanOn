package com.zzzode.leanon.reminders

import org.json.JSONObject

/**
 * Smart-silence decision (RFC 0020). Pure and JVM-unit-tested: a reminder
 * fires only when the day's task has not already been logged.
 */
object ReminderDecision {

  const val KIND_WEIGHT = "weight"
  const val KIND_MEALS = "meals"

  /**
   * @param kind one of [KIND_WEIGHT] / [KIND_MEALS]
   * @param today ISO date the host considers today
   * @param hostData the host's current records snapshot
   * @return true when a notification should be posted
   */
  fun shouldNotify(kind: String, today: String, hostData: JSONObject): Boolean {
    val arrayKey = if (kind == KIND_WEIGHT) "weights" else "intake"
    val array = hostData.optJSONArray(arrayKey) ?: return true
    for (index in 0 until array.length()) {
      val item = array.optJSONObject(index) ?: continue
      if (item.optString("date") == today) return false
    }
    return true
  }
}
