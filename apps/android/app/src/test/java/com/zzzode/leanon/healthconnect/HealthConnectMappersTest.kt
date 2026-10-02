package com.zzzode.leanon.healthconnect

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class HealthConnectMappersTest {

  @Test
  fun buildsDeterministicClientIds() {
    assertEquals("leanon-weight-2026-10-01", HealthConnectMappers.weightClientId("2026-10-01"))
    assertEquals("leanon-nutrition-2026-10-01", HealthConnectMappers.nutritionClientId("2026-10-01"))
    assertEquals("leanon-exercise-ex-1", HealthConnectMappers.exerciseClientId("ex-1"))
  }

  @Test
  fun mapsWeightRecord() {
    val record = HealthConnectMappers.weightRecord("2026-10-01", 80.4)
    assertEquals(80.4, record.weight.inKilograms, 0.0001)
    assertEquals("leanon-weight-2026-10-01", record.metadata.clientRecordId)
  }

  @Test
  fun mapsNutritionRecord() {
    val macros = JSONObject()
      .put("proteinG", 78.0)
      .put("carbsG", 128.0)
      .put("fatG", 36.0)
    val record = HealthConnectMappers.nutritionRecord("2026-10-01", 1180.0, macros)
    assertEquals(1180.0, record.energy?.inKilocalories ?: 0.0, 0.0001)
    assertEquals(78.0, record.protein?.inGrams ?: 0.0, 0.0001)
    assertEquals(128.0, record.totalCarbohydrate?.inGrams ?: 0.0, 0.0001)
    assertEquals(36.0, record.totalFat?.inGrams ?: 0.0, 0.0001)
  }

  @Test
  fun mapsExerciseRecordWithDuration() {
    val sample = JSONObject()
      .put("id", "ex-1")
      .put("date", "2026-10-01")
      .put("typeId", "running")
      .put("durationMin", 30)
      .put("kcal", 300)
    val record = HealthConnectMappers.exerciseRecord(sample)
    assertEquals("Running", record.title)
    assertEquals(1800, java.time.Duration.between(record.startTime, record.endTime).seconds)
    assertEquals("leanon-exercise-ex-1", record.metadata.clientRecordId)
  }

  @Test
  fun buildsAllRecordsFromHostData() {
    val hostData = JSONObject()
      .put(
        "weights",
        JSONArray().put(
          JSONObject().put("date", "2026-10-01").put("weightKg", 80.0),
        ),
      )
      .put(
        "intake",
        JSONArray().put(
          JSONObject()
            .put("date", "2026-10-01")
            .put("kcal", 1000.0)
            .put(
              "macros",
              JSONObject()
                .put("proteinG", 50.0)
                .put("carbsG", 100.0)
                .put("fatG", 30.0),
            ),
        ),
      )
      .put(
        "exercises",
        JSONArray().put(
          JSONObject()
            .put("id", "ex-1")
            .put("date", "2026-10-01")
            .put("typeId", "running")
            .put("durationMin", 30)
            .put("kcal", 300),
        ),
      )

    val records = HealthConnectMappers.buildAll(hostData)
    assertEquals(3, records.size)
  }
}
