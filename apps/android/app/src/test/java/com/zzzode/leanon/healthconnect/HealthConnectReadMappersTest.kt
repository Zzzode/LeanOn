package com.zzzode.leanon.healthconnect

import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Mass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

class HealthConnectReadMappersTest {

  private fun localDate(instant: Instant): String =
    instant.atZone(ZoneId.systemDefault()).toLocalDate().toString()

  private fun weight(
    time: Instant,
    kg: Double,
    metadata: Metadata,
  ): WeightRecord =
    WeightRecord(time, ZoneOffset.UTC, Mass.kilograms(kg), metadata)

  private fun session(
    start: Instant,
    end: Instant,
    type: Int,
    metadata: Metadata,
  ): ExerciseSessionRecord =
    ExerciseSessionRecord(
      startTime = start,
      startZoneOffset = ZoneOffset.UTC,
      endTime = end,
      endZoneOffset = ZoneOffset.UTC,
      metadata = metadata,
      exerciseType = type,
    )

  @Test
  fun latestWeightByDateKeepsLatestAndDropsEcho() {
    // Early-UTC instants stay on the same local date even at UTC+8.
    val day = Instant.parse("2026-09-01T00:00:00Z")
    val later = Instant.parse("2026-09-01T02:00:00Z")
    val externalEarly = weight(day, 80.5, Metadata.manualEntryWithId("w1"))
    val externalLater = weight(later, 80.1, Metadata.manualEntryWithId("w2"))
    val echo = weight(day, 99.0, Metadata.manualEntry("leanon-weight-2026-09-01", 1L))

    val result =
      HealthConnectReadMappers.latestWeightByDate(
        listOf(externalEarly, externalLater, echo),
      )

    assertEquals(1, result.size)
    assertEquals(80.1, result[localDate(day)]!!, 0.0001)
  }

  @Test
  fun mirrorExercisesMapsKnownTypeWithMetKcal() {
    val start = Instant.parse("2026-09-01T12:00:00Z")
    val end = Instant.parse("2026-09-01T12:30:00Z")
    val external = session(
      start,
      end,
      ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
      Metadata.manualEntryWithId("exuid-1"),
    )
    val echo = session(
      start,
      end,
      ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
      Metadata.manualEntry("leanon-exercise-x", 1L),
    )

    val mirrors =
      HealthConnectReadMappers.mirrorExercises(listOf(external, echo), 80.0)

    assertEquals(1, mirrors.size)
    val mirror = mirrors[0]
    assertEquals("hc-exuid-1", mirror.id)
    assertEquals(localDate(start), mirror.date)
    assertEquals("jogging", mirror.typeId)
    assertEquals(30.0, mirror.durationMin, 0.0001)
    // MET 7.0 x 80 kg x 0.5 h = 280 kcal.
    assertEquals(280.0, mirror.kcal, 0.0001)
  }

  @Test
  fun mirrorExercisesSkipsUnmappedTypeAndZeroDuration() {
    val start = Instant.parse("2026-09-01T12:00:00Z")
    val openWater = session(
      start,
      Instant.parse("2026-09-01T12:30:00Z"),
      ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER,
      Metadata.manualEntryWithId("exuid-2"),
    )
    // A 10-second session rounds to 0 whole minutes and is skipped.
    val shortSession = session(
      start,
      Instant.parse("2026-09-01T12:00:10Z"),
      ExerciseSessionRecord.EXERCISE_TYPE_WALKING,
      Metadata.manualEntryWithId("exuid-3"),
    )

    val mirrors =
      HealthConnectReadMappers.mirrorExercises(
        listOf(openWater, shortSession),
        80.0,
      )

    assertTrue(mirrors.isEmpty())
  }

  @Test
  fun mirrorExercisesEmptyWithoutBodyWeight() {
    val start = Instant.parse("2026-09-01T12:00:00Z")
    val external = session(
      start,
      Instant.parse("2026-09-01T12:30:00Z"),
      ExerciseSessionRecord.EXERCISE_TYPE_WALKING,
      Metadata.manualEntryWithId("exuid-4"),
    )

    assertTrue(
      HealthConnectReadMappers.mirrorExercises(listOf(external), 0.0).isEmpty(),
    )
  }

  @Test
  fun isExternalReflectsClientRecordId() {
    val external = Metadata.manualEntryWithId("x")
    val echo = Metadata.manualEntry("leanon-weight-x", 1L)

    assertTrue(HealthConnectReadMappers.isExternal(external))
    assertEquals(false, HealthConnectReadMappers.isExternal(echo))
    assertNull(ExerciseTypeMapping.resolve(ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER))
  }
}
