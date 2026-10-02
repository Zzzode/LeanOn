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

  /**
   * Resolve an external Health Connect exercise type to a LeanOn type id and the
   * MET used to estimate its calories (RFC 0025). Returns null for types we
   * cannot map so the caller skips them rather than guessing. Where several
   * LeanOn ids share one Health Connect type, the conservative (lower-MET)
   * representative is chosen so eat-back is not overstated during weight loss.
   */
  fun resolve(hcExerciseType: Int): ResolvedExercise? = REVERSE[hcExerciseType]

  data class ResolvedExercise(val typeId: String, val met: Double)

  private val REVERSE: Map<Int, ResolvedExercise> = mapOf(
    ExerciseSessionRecord.EXERCISE_TYPE_WALKING to ResolvedExercise("walking", 2.5),
    ExerciseSessionRecord.EXERCISE_TYPE_HIKING to ResolvedExercise("hiking", 6.0),
    ExerciseSessionRecord.EXERCISE_TYPE_RUNNING to ResolvedExercise("jogging", 7.0),
    ExerciseSessionRecord.EXERCISE_TYPE_BIKING to ResolvedExercise("cycling", 7.5),
    ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY to ResolvedExercise("cycling-stationary", 7.0),
    ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL to ResolvedExercise("swimming-slow", 4.5),
    ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING to ResolvedExercise("strength", 5.0),
    ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING to ResolvedExercise("hiit", 8.0),
    ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL to ResolvedExercise("elliptical", 5.0),
    ExerciseSessionRecord.EXERCISE_TYPE_YOGA to ResolvedExercise("yoga", 3.0),
    ExerciseSessionRecord.EXERCISE_TYPE_PILATES to ResolvedExercise("pilates", 3.0),
    ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING to ResolvedExercise("stairs", 8.0),
    ExerciseSessionRecord.EXERCISE_TYPE_BADMINTON to ResolvedExercise("badminton", 5.5),
    ExerciseSessionRecord.EXERCISE_TYPE_BASKETBALL to ResolvedExercise("basketball", 6.5),
    ExerciseSessionRecord.EXERCISE_TYPE_SOCCER to ResolvedExercise("soccer", 7.0),
    ExerciseSessionRecord.EXERCISE_TYPE_TENNIS to ResolvedExercise("tennis", 7.3),
    ExerciseSessionRecord.EXERCISE_TYPE_TABLE_TENNIS to ResolvedExercise("table-tennis", 4.0),
    ExerciseSessionRecord.EXERCISE_TYPE_DANCING to ResolvedExercise("dance", 5.0),
  )
}
