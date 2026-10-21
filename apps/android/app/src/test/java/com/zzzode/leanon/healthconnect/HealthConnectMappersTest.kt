package com.zzzode.leanon.healthconnect

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class HealthConnectMappersTest {

  private fun versionFixture(): JSONObject = JSONObject()
    .put("weights", JSONArray().put(JSONObject().put("date", "2026-10-06").put("weightKg", 80.0)))
    .put("intake", JSONArray().put(JSONObject().put("date", "2026-10-06").put("kcal", 1000.0)
      .put("macros", JSONObject().put("proteinG", 40.0).put("carbsG", 100.0).put("fatG", 30.0))))
    .put("exercises", JSONArray().put(JSONObject().put("id", "ex-1").put("date", "2026-10-06")
      .put("typeId", "running").put("durationMin", 30.0).put("kcal", 300.0)))

  @Test fun reservedVersionsReachEverySdkRecordAndMissingReservationsFailClosed() {
    val host = versionFixture()
    val requests = HealthConnectMappers.versionRequests(host)
    val versions = requests.mapIndexed { index, request -> request.clientRecordId to (index + 2L) }.toMap()
    for (record in HealthConnectMappers.buildAll(host, versions)) {
      assertEquals(versions.getValue(record.metadata.clientRecordId!!), record.metadata.clientRecordVersion)
    }
    assertThrows(IllegalArgumentException::class.java) { HealthConnectMappers.buildAll(host, emptyMap()) }
  }

  @Test fun fingerprintsIgnoreObjectOrderingRuntimeMetadataAndEquivalentNumericEncoding() {
    val first = versionFixture()
    val second = JSONObject(first.toString()).put("today", "2026-10-07").put("todayHour", 20).put("streak", 10)
    second.getJSONArray("weights").put(0, JSONObject().put("weightKg", 80).put("date", "2026-10-06"))
    assertEquals(HealthConnectMappers.versionRequests(first), HealthConnectMappers.versionRequests(second))
    assertEquals(64, HealthConnectMappers.versionRequests(first).first().fingerprint.length)
  }

  @Test fun exportedWeightNutritionAndExerciseEditsChangeTheirFingerprintOnly() {
    val first = versionFixture()
    val original = HealthConnectMappers.versionRequests(first)
    val weight = JSONObject(first.toString())
    weight.getJSONArray("weights").getJSONObject(0).put("weightKg", 79.5)
    val weightRequests = HealthConnectMappers.versionRequests(weight)
    assertNotEquals(original[0].fingerprint, weightRequests[0].fingerprint)
    assertEquals(original.drop(1), weightRequests.drop(1))
    val nutrition = JSONObject(first.toString())
    nutrition.getJSONArray("intake").getJSONObject(0).getJSONObject("macros").put("proteinG", 45.0)
    assertNotEquals(original[1].fingerprint, HealthConnectMappers.versionRequests(nutrition)[1].fingerprint)
    val exercise = JSONObject(first.toString())
    exercise.getJSONArray("exercises").getJSONObject(0).put("durationMin", 35.0)
    assertNotEquals(original[2].fingerprint, HealthConnectMappers.versionRequests(exercise)[2].fingerprint)
  }

  @Test fun omittedMicrosAndUnexportedExerciseCaloriesDoNotBumpRevisions() {
    val first = versionFixture()
    val second = JSONObject(first.toString())
    second.getJSONArray("intake").getJSONObject(0).put("micros", JSONObject().put("fiberG", 0).put("sugarG", 0)
      .put("saturatedFatG", 0).put("sodiumMg", 0))
    second.getJSONArray("exercises").getJSONObject(0).put("kcal", 350.0)
    assertEquals(HealthConnectMappers.versionRequests(first), HealthConnectMappers.versionRequests(second))
  }

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
    val micros = JSONObject()
      .put("fiberG", 24.0)
      .put("sugarG", 40.0)
      .put("saturatedFatG", 18.0)
      .put("sodiumMg", 2000.0)
    val record = HealthConnectMappers.nutritionRecord("2026-10-01", 1180.0, macros, micros)
    assertEquals(1180.0, record.energy?.inKilocalories ?: 0.0, 0.0001)
    assertEquals(78.0, record.protein?.inGrams ?: 0.0, 0.0001)
    assertEquals(128.0, record.totalCarbohydrate?.inGrams ?: 0.0, 0.0001)
    assertEquals(36.0, record.totalFat?.inGrams ?: 0.0, 0.0001)
    assertEquals(24.0, record.dietaryFiber?.inGrams ?: 0.0, 0.0001)
    assertEquals(40.0, record.sugar?.inGrams ?: 0.0, 0.0001)
    assertEquals(18.0, record.saturatedFat?.inGrams ?: 0.0, 0.0001)
    // Sodium is stored in milligrams; Health Connect uses grams (2000 mg = 2 g).
    assertEquals(2.0, record.sodium?.inGrams ?: 0.0, 0.0001)
  }

  @Test
  fun omitsZeroMicronutrients() {
    val record = HealthConnectMappers.nutritionRecord(
      "2026-10-01",
      1000.0,
      JSONObject(),
      JSONObject(),
    )
    assertNull(record.dietaryFiber)
    assertNull(record.sugar)
    assertNull(record.saturatedFat)
    assertNull(record.sodium)
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

  @Test fun externalMirrorsAreNeverEchoedBackAsLeanOnOwnedRecords() {
    val weights = JSONArray()
    val intake = JSONArray()
    val exercises = JSONArray()
    for (source in listOf<String?>(null, "leanon", "health_connect", "healthkit", "unknown")) {
      val weight = JSONObject().put("date", "2026-10-01").put("weightKg", 80.0)
      val meal = JSONObject().put("date", "2026-10-01").put("kcal", 1000)
      val exercise = JSONObject().put("id", "ex-$source").put("date", "2026-10-01")
        .put("typeId", "running").put("durationMin", 30.5)
      if (source != null) { weight.put("source", source); meal.put("source", source); exercise.put("source", source) }
      weights.put(weight); intake.put(meal); exercises.put(exercise)
    }
    val exported = HealthConnectMappers.buildAll(JSONObject().put("weights", weights).put("intake", intake).put("exercises", exercises))
    assertEquals(6, exported.size)
    val exercise = exported.filterIsInstance<androidx.health.connect.client.records.ExerciseSessionRecord>().first()
    assertEquals(1830L, java.time.Duration.between(exercise.startTime, exercise.endTime).seconds)
  }
}
