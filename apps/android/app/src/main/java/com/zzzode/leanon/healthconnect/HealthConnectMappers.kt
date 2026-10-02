package com.zzzode.leanon.healthconnect

import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * Pure mappers from LeanOn's persisted HostData JSON to Health Connect records.
 * Every record carries a deterministic clientRecordId so repeated inserts of the
 * same logical record are idempotent (Health Connect updates rather than
 * duplicates). No Android framework or running client is touched here, so the
 * scalar logic is unit testable.
 */
object HealthConnectMappers {

  const val WEIGHT_PREFIX = "leanon-weight-"
  const val NUTRITION_PREFIX = "leanon-nutrition-"
  const val EXERCISE_PREFIX = "leanon-exercise-"

  private const val CLIENT_RECORD_VERSION = 1L

  fun weightClientId(date: String): String = "$WEIGHT_PREFIX$date"
  fun nutritionClientId(date: String): String = "$NUTRITION_PREFIX$date"
  fun exerciseClientId(sampleId: String): String = "$EXERCISE_PREFIX$sampleId"

  private fun metadata(clientRecordId: String): Metadata =
    Metadata.manualEntry(
      clientRecordId = clientRecordId,
      clientRecordVersion = CLIENT_RECORD_VERSION,
    )

  private fun instantAt(date: String, hour: Int): Instant =
    LocalDate.parse(date).atTime(hour, 0).toInstant(ZoneOffset.UTC)

  fun weightRecord(date: String, weightKg: Double): WeightRecord =
    WeightRecord(
      instantAt(date, 7),
      null,
      Mass.kilograms(weightKg),
      metadata(weightClientId(date)),
    )

  fun nutritionRecord(
    date: String,
    kcal: Double,
    macros: JSONObject,
    micros: JSONObject,
  ): NutritionRecord =
    NutritionRecord(
      startTime = instantAt(date, 20),
      startZoneOffset = null,
      endTime = instantAt(date, 21),
      endZoneOffset = null,
      metadata = metadata(nutritionClientId(date)),
      energy = Energy.kilocalories(kcal),
      protein = Mass.grams(macros.optDouble("proteinG", 0.0)),
      totalCarbohydrate = Mass.grams(macros.optDouble("carbsG", 0.0)),
      totalFat = Mass.grams(macros.optDouble("fatG", 0.0)),
      // Micronutrients (RFC 0024): null omits the field; sodium mg -> grams.
      dietaryFiber = optionalGrams(micros, "fiberG"),
      sugar = optionalGrams(micros, "sugarG"),
      saturatedFat = optionalGrams(micros, "saturatedFatG"),
      sodium = optionalSodium(micros),
    )

  /** A positive value in grams as Mass, or null to omit the field. */
  private fun optionalGrams(json: JSONObject, key: String): Mass? {
    val value = json.optDouble(key, 0.0)
    return if (value > 0.0) Mass.grams(value) else null
  }

  /** Sodium is stored in mg; Health Connect uses grams. Non-zero only. */
  private fun optionalSodium(json: JSONObject): Mass? {
    val mg = json.optDouble("sodiumMg", 0.0)
    return if (mg > 0.0) Mass.grams(mg / 1000.0) else null
  }

  fun exerciseRecord(sample: JSONObject): ExerciseSessionRecord {
    val sampleId = sample.getString("id")
    val date = sample.getString("date")
    val durationMin = sample.optInt("durationMin", 0)
    val typeId = sample.optString("typeId", "")
    val start = instantAt(date, 18)
    val end = start.plusSeconds(durationMin * 60L)
    return ExerciseSessionRecord(
      startTime = start,
      startZoneOffset = null,
      endTime = end,
      endZoneOffset = null,
      exerciseType = ExerciseTypeMapping.exerciseType(typeId),
      title = ExerciseTypeMapping.title(typeId),
      metadata = metadata(exerciseClientId(sampleId)),
    )
  }

  /** Builds every exportable record from a HostData JSON object. */
  fun buildAll(hostData: JSONObject): List<Record> {
    val records = mutableListOf<Record>()

    val weights = hostData.optJSONArray("weights")
    if (weights != null) {
      for (i in 0 until weights.length()) {
        val w = weights.getJSONObject(i)
        records += weightRecord(w.getString("date"), w.getDouble("weightKg"))
      }
    }

    val intake = hostData.optJSONArray("intake")
    if (intake != null) {
      for (i in 0 until intake.length()) {
        val n = intake.getJSONObject(i)
        records += nutritionRecord(
          n.getString("date"),
          n.getDouble("kcal"),
          n.optJSONObject("macros") ?: JSONObject(),
          n.optJSONObject("micros") ?: JSONObject(),
        )
      }
    }

    val exercises = hostData.optJSONArray("exercises")
    if (exercises != null) {
      for (i in 0 until exercises.length()) {
        records += exerciseRecord(exercises.getJSONObject(i))
      }
    }

    return records
  }
}
