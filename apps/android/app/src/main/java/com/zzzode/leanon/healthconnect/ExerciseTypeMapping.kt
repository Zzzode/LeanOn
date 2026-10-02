package com.zzzode.leanon.healthconnect

import androidx.health.connect.client.records.ExerciseSessionRecord

/**
 * Maps LeanOn exercise type ids (from @zzzode/exercise-data) to Health Connect
 * ExerciseType constants and an English session title. Keeping this on the
 * Android side mirrors the platform-specific nature of Health Connect.
 */
object ExerciseTypeMapping {

  private val MAPPING: Map<String, Pair<Int, String>> = mapOf(
    "walking" to (ExerciseSessionRecord.EXERCISE_TYPE_WALKING to "Walking"),
    "walking-brisk" to (ExerciseSessionRecord.EXERCISE_TYPE_WALKING to "Brisk walking"),
    "hiking" to (ExerciseSessionRecord.EXERCISE_TYPE_HIKING to "Hiking"),
    "jogging" to (ExerciseSessionRecord.EXERCISE_TYPE_RUNNING to "Jogging"),
    "running" to (ExerciseSessionRecord.EXERCISE_TYPE_RUNNING to "Running"),
    "running-fast" to (ExerciseSessionRecord.EXERCISE_TYPE_RUNNING to "Fast running"),
    "cycling" to (ExerciseSessionRecord.EXERCISE_TYPE_BIKING to "Cycling"),
    "cycling-stationary" to (ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY to "Stationary bike"),
    "swimming" to (ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL to "Swimming"),
    "swimming-slow" to (ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL to "Slow swimming"),
    "strength" to (ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING to "Strength training"),
    "strength-hard" to (ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING to "Heavy strength training"),
    "hiit" to (ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING to "HIIT"),
    "elliptical" to (ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL to "Elliptical"),
    "rope" to (ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT to "Rope skipping"),
    "yoga" to (ExerciseSessionRecord.EXERCISE_TYPE_YOGA to "Yoga"),
    "pilates" to (ExerciseSessionRecord.EXERCISE_TYPE_PILATES to "Pilates"),
    "stairs" to (ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING to "Stair climbing"),
    "badminton" to (ExerciseSessionRecord.EXERCISE_TYPE_BADMINTON to "Badminton"),
    "basketball" to (ExerciseSessionRecord.EXERCISE_TYPE_BASKETBALL to "Basketball"),
    "soccer" to (ExerciseSessionRecord.EXERCISE_TYPE_SOCCER to "Soccer"),
    "tennis" to (ExerciseSessionRecord.EXERCISE_TYPE_TENNIS to "Tennis"),
    "table-tennis" to (ExerciseSessionRecord.EXERCISE_TYPE_TABLE_TENNIS to "Table tennis"),
    "dance" to (ExerciseSessionRecord.EXERCISE_TYPE_DANCING to "Dance / aerobics"),
  )

  fun exerciseType(typeId: String): Int =
    MAPPING[typeId]?.first ?: ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT

  fun title(typeId: String): String =
    MAPPING[typeId]?.second ?: "Workout"
}
