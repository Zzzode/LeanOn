package com.zzzode.leanon.healthconnect

import com.zzzode.leanon.bridge.PendingRequest
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.WeightRecord

/**
 * Bridges the command-style Lynx module call to Health Connect's Activity-based
 * permission contract. The Activity registers [contract] before it is started;
 * the module launches it and the result is delivered to the pending callback.
 */
object HealthConnectPermission {

  val PERMISSIONS: Set<String> = setOf(
    HealthPermission.getReadPermission(WeightRecord::class),
    HealthPermission.getWritePermission(WeightRecord::class),
    HealthPermission.getWritePermission(NutritionRecord::class),
    HealthPermission.getReadPermission(ExerciseSessionRecord::class),
    HealthPermission.getWritePermission(ExerciseSessionRecord::class),
  )

  val contract = androidx.health.connect.client.PermissionController
    .createRequestPermissionResultContract()

  private val pending = PendingRequest<Boolean>()

  fun launch(
    launcher: ActivityResultLauncher<Set<String>>,
    onResult: (Boolean) -> Unit,
  ): Boolean {
    if (!pending.begin(onResult)) return false
    try { launcher.launch(PERMISSIONS) } catch (_: Exception) { pending.complete(false) }
    return true
  }

  fun cancel() { pending.complete(false) }

  fun handleResult(grantedPermissions: Set<String>) {
    pending.complete(grantedPermissions.containsAll(PERMISSIONS))
  }
}
