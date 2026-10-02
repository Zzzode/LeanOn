package com.zzzode.leanon.healthconnect

import android.app.Activity
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

  @Volatile
  private var pending: ((Boolean) -> Unit)? = null

  fun launch(
    launcher: ActivityResultLauncher<Set<String>>,
    onResult: (Boolean) -> Unit,
  ) {
    pending = onResult
    launcher.launch(PERMISSIONS)
  }

  fun handleResult(grantedPermissions: Set<String>) {
    val callback = pending
    pending = null
    callback?.invoke(grantedPermissions.containsAll(PERMISSIONS))
  }
}
