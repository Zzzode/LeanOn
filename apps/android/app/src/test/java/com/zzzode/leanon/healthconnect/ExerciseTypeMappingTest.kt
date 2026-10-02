package com.zzzode.leanon.healthconnect

import androidx.health.connect.client.records.ExerciseSessionRecord
import org.junit.Assert.assertEquals
import org.junit.Test

class ExerciseTypeMappingTest {

  @Test
  fun mapsKnownTypeIdsToHealthConnectConstants() {
    assertEquals(
      ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
      ExerciseTypeMapping.exerciseType("running"),
    )
    assertEquals(
      ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
      ExerciseTypeMapping.exerciseType("strength"),
    )
    assertEquals(
      ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT,
      ExerciseTypeMapping.exerciseType("rope"),
    )
    assertEquals(
      ExerciseSessionRecord.EXERCISE_TYPE_YOGA,
      ExerciseTypeMapping.exerciseType("yoga"),
    )
  }

  @Test
  fun unknownTypeFallsBackToOtherWorkout() {
    assertEquals(
      ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT,
      ExerciseTypeMapping.exerciseType("does-not-exist"),
    )
  }

  @Test
  fun providesEnglishTitles() {
    assertEquals("Running", ExerciseTypeMapping.title("running"))
    assertEquals("Workout", ExerciseTypeMapping.title("does-not-exist"))
  }
}
