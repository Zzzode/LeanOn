package com.zzzode.leanon.reminders

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReminderDecisionTest {

  private val today = "2026-10-01"

  private fun host(
    weights: JSONArray? = null,
    meals: JSONArray? = null,
  ): JSONObject {
    val data = JSONObject()
    if (weights != null) data.put("weights", weights)
    if (meals != null) data.put("intake", meals)
    return data
  }

  private fun samples(vararg dates: String): JSONArray {
    val array = JSONArray()
    dates.forEach { date ->
      array.put(JSONObject().put("date", date))
    }
    return array
  }

  @Test
  fun weightFiresWhenNotLoggedToday() {
    assertTrue(
      ReminderDecision.shouldNotify(
        ReminderDecision.KIND_WEIGHT,
        today,
        host(weights = samples("2026-09-30")),
      ),
    )
  }

  @Test
  fun weightSilentWhenLoggedToday() {
    assertFalse(
      ReminderDecision.shouldNotify(
        ReminderDecision.KIND_WEIGHT,
        today,
        host(weights = samples("2026-09-30", today)),
      ),
    )
  }

  @Test
  fun mealsFiresWhenNotLoggedToday() {
    assertTrue(
      ReminderDecision.shouldNotify(
        ReminderDecision.KIND_MEALS,
        today,
        host(meals = samples()),
      ),
    )
  }

  @Test
  fun mealsSilentWhenLoggedToday() {
    assertFalse(
      ReminderDecision.shouldNotify(
        ReminderDecision.KIND_MEALS,
        today,
        host(meals = samples(today)),
      ),
    )
  }

  @Test
  fun missingArrayMeansNotify() {
    assertTrue(
      ReminderDecision.shouldNotify(
        ReminderDecision.KIND_WEIGHT,
        today,
        JSONObject(),
      ),
    )
  }
}
