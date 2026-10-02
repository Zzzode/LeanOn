package com.zzzode.leanon.healthconnect

import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.zzzode.leanon.LeanOnApplication
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.Duration
import java.time.Instant
import kotlin.reflect.KClass

/**
 * Owns the Health Connect client and the sync lifecycle. All operations are
 * best-effort and run off the logging write path: failures are logged and never
 * propagated, so Health Connect can never block or fail a user's entry.
 *
 * RFC 0021 performed one-way export; RFC 0025 adds a controlled two-way sync:
 * external weight/exercise records are mirrored in (as read-only `hc-` records)
 * and LeanOn records continue to be exported, with exercise deletions now
 * reconciled via deleteRecords.
 */
class HealthConnectManager(private val app: LeanOnApplication) {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  private val client: HealthConnectClient? by lazy {
    runCatching { HealthConnectClient.getOrCreate(app) }.getOrNull()
  }

  fun isSupported(): Boolean =
    runCatching {
      HealthConnectClient.getSdkStatus(app) == HealthConnectClient.SDK_AVAILABLE
    }.getOrDefault(false)

  suspend fun permissionsGranted(): Boolean {
    val connectClient = client ?: return false
    return runCatching {
      connectClient.permissionController.getGrantedPermissions()
        .containsAll(HealthConnectPermission.PERMISSIONS)
    }.getOrDefault(false)
  }

  /** Full idempotent export of all weight/nutrition/exercise records. */
  suspend fun backfill() {
    val connectClient = client ?: return
    if (!permissionsGranted()) return
    val records = HealthConnectMappers.buildAll(app.records.loadHostData())
    if (records.isEmpty()) return
    runCatching {
      connectClient.insertRecords(records)
    }.onFailure { Log.w(TAG, "Health Connect export failed", it) }
  }

  fun syncAllAsync() {
    scope.launch { runCatching { backfill() } }
  }

  /** Called after any native write; re-exports only while the feature is enabled. */
  fun onRecordsChanged() {
    if (app.settings.getHealthConnectEnabled()) syncAllAsync()
  }

  /**
   * Two-way sync (RFC 0025): mirror external weight and exercise into the store,
   * then export LeanOn records and stamp the sync time. Returns false when the
   * platform is unavailable, permissions are missing, or any step fails.
   */
  suspend fun sync(): Boolean {
    val connectClient = client ?: return false
    if (!permissionsGranted()) return false
    return runCatching {
      val host = app.records.loadHostData()
      val bodyWeightKg = latestWeightKg(host)
      val externalWeights =
        readRange(connectClient, WeightRecord::class, WEIGHT_LOOKBACK_DAYS)
      val externalExercises =
        readRange(connectClient, ExerciseSessionRecord::class, EXERCISE_LOOKBACK_DAYS)
      val weightsByDate =
        HealthConnectReadMappers.latestWeightByDate(externalWeights)
      val mirrors =
        HealthConnectReadMappers.mirrorExercises(externalExercises, bodyWeightKg)
      app.records.replaceExternalWeights(weightsByDate)
      app.records.replaceExternalExercises(mirrors)
      backfill()
      app.settings.setLastSyncEpochMs(System.currentTimeMillis())
      true
    }.getOrElse {
      Log.w(TAG, "Health Connect two-way sync failed", it)
      false
    }
  }

  /** Run [sync] off the caller and report success via [onResult] on the IO scope. */
  fun syncAsync(onResult: (Boolean) -> Unit) {
    scope.launch {
      val ok = runCatching { sync() }.getOrDefault(false)
      onResult(ok)
    }
  }

  /**
   * Delete the Health Connect session exported for the LeanOn exercise with [id]
   * (RFC 0025), keyed by its clientRecordId. Best-effort and fire-and-forget so
   * the local delete always succeeds.
   */
  fun deleteExerciseSessionAsync(id: String) {
    scope.launch {
      val connectClient = client ?: return@launch
      if (!permissionsGranted()) return@launch
      runCatching {
        connectClient.deleteRecords(
          ExerciseSessionRecord::class,
          emptyList(),
          listOf("$LEANON_EXERCISE_PREFIX$id"),
        )
      }.onFailure { Log.w(TAG, "Health Connect session delete failed", it) }
    }
  }

  private suspend fun <T : Record> readRange(
    connectClient: HealthConnectClient,
    type: KClass<T>,
    days: Long,
  ): List<T> {
    val now = Instant.now()
    val start = now.minus(Duration.ofDays(days))
    val request = ReadRecordsRequest(
      recordType = type,
      timeRangeFilter = TimeRangeFilter(startTime = start, endTime = now),
    )
    return connectClient.readRecords(request).records
  }

  private fun latestWeightKg(host: JSONObject): Double {
    val weights = host.optJSONArray(WEIGHTS_KEY) ?: return 0.0
    if (weights.length() == 0) return 0.0
    return weights.getJSONObject(weights.length() - 1)
      .optDouble(WEIGHT_KG_KEY, 0.0)
  }

  companion object {
    private const val TAG = "HealthConnect"
    private const val WEIGHTS_KEY = "weights"
    private const val WEIGHT_KG_KEY = "weightKg"
    private const val LEANON_EXERCISE_PREFIX = "leanon-exercise-"
    private const val WEIGHT_LOOKBACK_DAYS = 90L
    private const val EXERCISE_LOOKBACK_DAYS = 30L
  }
}
