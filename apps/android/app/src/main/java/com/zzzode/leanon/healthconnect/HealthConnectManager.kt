package com.zzzode.leanon.healthconnect

import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.zzzode.leanon.LeanOnApplication
import com.zzzode.leanon.data.toJavaOnlyMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.File
import java.io.IOException
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
  private val exportLock = Mutex()
  private val syncLock = Mutex()
  private val localCommits = HealthSyncCommitGate()
  private val versions by lazy {
    HealthConnectExportLedger(app)
  }
  /** Invalidate old provider work before clearing only this local namespace. */
  fun withLocalDataDeletion(delete: () -> Unit) = performLocalHealthDataDeletion(
    app.settings, localCommits, { scope.coroutineContext.cancelChildren() }, delete,
  )
  private fun currentGeneration() = localCommits.current()
  private fun <T> commitIfCurrent(expected: Long, commit: () -> T): T = localCommits.commit(expected, commit)

  private val client: HealthConnectClient? by lazy {
    runCatching { HealthConnectClient.getOrCreate(app) }.getOrNull()
  }

  fun isSupported(): Boolean =
    runCatching {
      HealthConnectClient.getSdkStatus(app) == HealthConnectClient.SDK_AVAILABLE
    }.getOrDefault(false)

  suspend fun permissionsGranted(): Boolean {
    val connectClient = client ?: throw IOException("Health Connect client is unavailable")
    return connectClient.permissionController.getGrantedPermissions()
      .containsAll(HealthConnectPermission.PERMISSIONS)
  }

  /** Full idempotent export of all weight/nutrition/exercise records. */
  suspend fun backfill(): Boolean {
    val expectedGeneration = currentGeneration()
    return exportLock.withLock {
    val connectClient = client ?: return@withLock false
    runCatching {
      if (!app.settings.getHealthConnectEnabled()) return@runCatching false
      if (!permissionsGranted()) return@runCatching false
      val records = commitIfCurrent(expectedGeneration) {
        val snapshot = app.records.loadHostData()
        val reserved = versions.reserve(HealthConnectMappers.versionRequests(snapshot))
        HealthConnectMappers.buildAll(snapshot, reserved)
      }
      if (records.isEmpty()) return@runCatching true
      connectClient.insertRecords(records)
      true
    }.getOrElse { Log.w(TAG, "Health Connect export failed", it); false }
    }
  }

  fun syncAllAsync() {
    scope.launch { runCatching { backfill() } }
  }

  /** Called after any native write; re-exports only while the feature is enabled. */
  fun onRecordsChanged() {
    runCatching { if (app.settings.getHealthConnectEnabled()) syncAllAsync() }
      .onFailure { Log.w(TAG, "Unable to read Health Connect settings", it) }
  }

  /**
   * Two-way sync (RFC 0025): mirror external weight and exercise into the store,
   * then export LeanOn records and stamp the sync time. Returns false when the
   * platform is unavailable, permissions are missing, or any step fails.
   */
  suspend fun sync(): Boolean {
    val expectedGeneration = currentGeneration()
    return syncLock.withLock {
    val connectClient = client ?: return@withLock false
    runCatching {
      if (!app.settings.getHealthConnectEnabled()) return@runCatching false
      if (!permissionsGranted()) return@runCatching false
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
      completeHealthConnectSync(
        importMirrors = {
          commitIfCurrent(expectedGeneration) {
            app.records.replaceExternalWeights(weightsByDate)
            val snapshot = app.records.replaceExternalExercises(mirrors)
            app.events.dispatch("records.changed", JSONObject().put("hostData", snapshot).toJavaOnlyMap())
          }
        },
        exportRecords = { if (currentGeneration() == expectedGeneration) backfill() else false },
        stampSuccess = { commitIfCurrent(expectedGeneration) { app.settings.setLastSyncEpochMs(System.currentTimeMillis()) } },
      )
    }.getOrElse {
      Log.w(TAG, "Health Connect two-way sync failed", it)
      false
    }
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
      exportLock.withLock {
        val connectClient = client ?: return@withLock
        runCatching {
          if (!permissionsGranted()) return@runCatching
          connectClient.deleteRecords(
            ExerciseSessionRecord::class,
            emptyList(),
            listOf("$LEANON_EXERCISE_PREFIX$id"),
          )
        }.onFailure { Log.w(TAG, "Health Connect session delete failed", it) }
      }
    }
  }

  private suspend fun <T : Record> readRange(
    connectClient: HealthConnectClient,
    type: KClass<T>,
    days: Long,
  ): List<T> {
    val now = Instant.now()
    val start = now.minus(Duration.ofDays(days))
    val records = mutableListOf<T>()
    var pageToken: String? = null
    do {
      val response = connectClient.readRecords(ReadRecordsRequest(
        recordType = type,
        timeRangeFilter = TimeRangeFilter.between(start, now),
        pageToken = pageToken,
      ))
      records.addAll(response.records)
      pageToken = response.pageToken
    } while (pageToken != null)
    return records
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
