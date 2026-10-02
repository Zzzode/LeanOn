package com.zzzode.leanon.healthconnect

import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Mass
import com.zzzode.leanon.data.ExternalExercise
import java.time.Instant
import java.time.ZoneId
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/**
 * Pure mappers for the read/import direction (RFC 0025): Health Connect records
 * authored by other apps become LeanOn mirror data. Records LeanOn exported
 * itself (clientRecordId starting with "leanon-") are treated as echo and
 * skipped. No client or I/O is touched here, so the logic is JVM unit tested.
 */
object HealthConnectReadMappers {

  /** True when the record was authored by another app (not a LeanOn echo). */
  fun isExternal(metadata: Metadata): Boolean {
    val clientRecordId = metadata.clientRecordId
    return clientRecordId == null || !clientRecordId.startsWith(LEANON_PREFIX)
  }

  /**
   * Group external weight records by local date, keeping the latest time-point
   * per day. Mirrors for dates LeanOn logged itself are filtered later by the
   * repository.
   */
  fun latestWeightByDate(records: List<WeightRecord>): Map<String, Double> {
    val byDate = LinkedHashMap<String, WeightRecord>()
    for (record in records) {
      if (!isExternal(record.metadata)) continue
      val date = localDate(record.time)
      val existing = byDate[date]
      if (existing == null || record.time.isAfter(existing.time)) {
        byDate[date] = record
      }
    }
    return byDate.mapValues { entry ->
      val mass: Mass = entry.value.weight
      mass.inKilograms
    }
  }

  /**
   * Map external exercise sessions to mirror exercises. Sessions whose type
   * cannot be resolved, or whose duration is non-positive, are skipped;
   * kilocalories use the same MET x mass x hours formula as manual logging.
   */
  fun mirrorExercises(
    records: List<ExerciseSessionRecord>,
    bodyWeightKg: Double,
  ): List<ExternalExercise> {
    if (!bodyWeightKg.isFinite() || bodyWeightKg <= 0.0) return emptyList()
    val mirrors = ArrayList<ExternalExercise>()
    for (record in records) {
      if (!isExternal(record.metadata)) continue
      val resolved = ExerciseTypeMapping.resolve(record.exerciseType) ?: continue
      val durationMin =
        ((record.endTime.toEpochMilli() - record.startTime.toEpochMilli()) /
          MILLIS_PER_MINUTE).roundToLong()
      if (durationMin <= 0L) continue
      val kcal =
        (resolved.met * bodyWeightKg * (durationMin / MINUTES_PER_HOUR))
          .roundToInt()
      mirrors.add(
        ExternalExercise(
          id = "$MIRROR_PREFIX${record.metadata.id}",
          date = localDate(record.startTime),
          typeId = resolved.typeId,
          durationMin = durationMin.toDouble(),
          kcal = kcal.toDouble(),
        ),
      )
    }
    return mirrors
  }

  private fun localDate(instant: Instant): String =
    instant.atZone(ZoneId.systemDefault()).toLocalDate().toString()

  private const val LEANON_PREFIX = "leanon-"
  private const val MIRROR_PREFIX = "hc-"
  private const val MILLIS_PER_MINUTE = 60000.0
  private const val MINUTES_PER_HOUR = 60.0
}
