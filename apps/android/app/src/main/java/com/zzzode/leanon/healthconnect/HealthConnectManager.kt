package com.zzzode.leanon.healthconnect

import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import com.zzzode.leanon.LeanOnApplication
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Owns the Health Connect client and the export lifecycle. All exports are
 * best-effort and run off the logging write path: failures are logged and never
 * propagated, so Health Connect can never block or fail a user's entry.
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

  companion object {
    private const val TAG = "HealthConnect"
  }
}
