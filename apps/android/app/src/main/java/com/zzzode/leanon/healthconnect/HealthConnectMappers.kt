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
import java.security.MessageDigest
import org.json.JSONArray
import kotlin.math.roundToLong

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

  private const val INITIAL_RECORD_VERSION = 2L

  fun weightClientId(date: String): String = "$WEIGHT_PREFIX$date"
  fun nutritionClientId(date: String): String = "$NUTRITION_PREFIX$date"
  fun exerciseClientId(sampleId: String): String = "$EXERCISE_PREFIX$sampleId"

  private fun metadata(clientRecordId: String, version: Long): Metadata =
    Metadata.manualEntry(
      clientRecordId = clientRecordId,
      clientRecordVersion = version,
    )

  private fun instantAt(date: String, hour: Int): Instant =
    LocalDate.parse(date).atTime(hour, 0).toInstant(ZoneOffset.UTC)

  fun weightRecord(date: String, weightKg: Double, version: Long = INITIAL_RECORD_VERSION): WeightRecord =
    WeightRecord(
      instantAt(date, 7),
      null,
      Mass.kilograms(weightKg),
      metadata(weightClientId(date), version),
    )

  fun nutritionRecord(
    date: String,
    kcal: Double,
    macros: JSONObject,
    micros: JSONObject,
    version: Long = INITIAL_RECORD_VERSION,
  ): NutritionRecord =
    NutritionRecord(
      startTime = instantAt(date, 20),
      startZoneOffset = null,
      endTime = instantAt(date, 21),
      endZoneOffset = null,
      metadata = metadata(nutritionClientId(date), version),
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

  fun exerciseRecord(sample: JSONObject, version: Long = INITIAL_RECORD_VERSION): ExerciseSessionRecord {
    val sampleId = sample.getString("id")
    val date = sample.getString("date")
    val durationMin = sample.getDouble("durationMin")
    val typeId = sample.optString("typeId", "")
    val start = instantAt(date, 18)
    val end = start.plusSeconds((durationMin * 60.0).roundToLong())
    return ExerciseSessionRecord(
      startTime = start,
      startZoneOffset = null,
      endTime = end,
      endZoneOffset = null,
      exerciseType = ExerciseTypeMapping.exerciseType(typeId),
      title = ExerciseTypeMapping.title(typeId),
      metadata = metadata(exerciseClientId(sampleId), version),
    )
  }

  private fun isOwned(record: JSONObject): Boolean =
    !record.has("source") || record.isNull("source") || record.optString("source") == "leanon"

  /** Builds every exportable record from a HostData JSON object. */
  fun buildAll(hostData: JSONObject, versions: Map<String, Long>? = null): List<Record> {
    val records = mutableListOf<Record>()
    fun version(id: String): Long = if (versions == null) INITIAL_RECORD_VERSION
      else requireNotNull(versions[id]) { "Export revision was not durably reserved for $id" }

    val weights = hostData.optJSONArray("weights")
    if (weights != null) {
      for (i in 0 until weights.length()) {
        val w = weights.getJSONObject(i)
        if (!isOwned(w)) continue
        val date = w.getString("date")
        records += weightRecord(date, w.getDouble("weightKg"), version(weightClientId(date)))
      }
    }

    val intake = hostData.optJSONArray("intake")
    if (intake != null) {
      for (i in 0 until intake.length()) {
        val n = intake.getJSONObject(i)
        if (!isOwned(n)) continue
        records += nutritionRecord(
          n.getString("date"),
          n.getDouble("kcal"),
          n.optJSONObject("macros") ?: JSONObject(),
          n.optJSONObject("micros") ?: JSONObject(),
          version(nutritionClientId(n.getString("date"))),
        )
      }
    }

    val exercises = hostData.optJSONArray("exercises")
    if (exercises != null) {
      for (i in 0 until exercises.length()) {
        val session = exercises.getJSONObject(i)
        if (isOwned(session)) records += exerciseRecord(session, version(exerciseClientId(session.getString("id"))))
      }
    }

    return records
  }

  /** Canonical exported fields, independent of JSON ordering or volatile metadata.
   * The digest identifies content; it is never interpreted as a numeric revision.
   */
  fun versionRequests(hostData: JSONObject): List<ExportVersionRequest> = buildAll(hostData).map { record ->
    val fields: List<Any?> = when (record) {
      is WeightRecord -> listOf("weight-v1", record.time.toString(), record.weight.inKilograms)
      is NutritionRecord -> listOf("nutrition-v1", record.startTime.toString(), record.endTime.toString(),
        record.energy?.inKilocalories, record.protein?.inGrams, record.totalCarbohydrate?.inGrams,
        record.totalFat?.inGrams, record.dietaryFiber?.inGrams, record.sugar?.inGrams,
        record.saturatedFat?.inGrams, record.sodium?.inGrams)
      is ExerciseSessionRecord -> listOf("exercise-v1", record.startTime.toString(), record.endTime.toString(),
        record.exerciseType, record.title)
      else -> error("Unsupported export record")
    }
    val canonical = JSONArray(fields).toString()
    val hash = MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray(Charsets.UTF_8))
      .joinToString("") { "%02x".format(it.toInt() and 0xFF) }
    ExportVersionRequest(requireNotNull(record.metadata.clientRecordId), hash)
  }
}
