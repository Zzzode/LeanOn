package com.zzzode.leanon.scanner

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import androidx.core.content.ContextCompat

internal enum class CameraPermission(val wire: String) {
  NOT_DETERMINED("not-determined"), AUTHORIZED("authorized"), DENIED("denied"), RESTRICTED("restricted")
}

internal fun cameraPermission(granted: Boolean, policyRevoked: Boolean, rationale: Boolean, requested: Boolean): CameraPermission = when {
  policyRevoked -> CameraPermission.RESTRICTED
  granted -> CameraPermission.AUTHORIZED
  rationale || requested -> CameraPermission.DENIED
  else -> CameraPermission.NOT_DETERMINED
}

/** Enumeration never opens a camera or requests permission. The scanner uses the back lens only. */
internal object BarcodeCameraStatus {
  private const val PREFERENCES = "barcode-camera-permission"
  private const val REQUESTED = "requested"

  fun available(context: Context): Boolean = try {
    val manager = context.getSystemService(Context.CAMERA_SERVICE) as? CameraManager
    manager != null && manager.cameraIdList.any {
      manager.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
    }
  } catch (_: Exception) { false }

  fun permission(context: Context, activity: Activity?): CameraPermission = cameraPermission(
    ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED,
    context.packageManager.isPermissionRevokedByPolicy(Manifest.permission.CAMERA, context.packageName),
    activity?.shouldShowRequestPermissionRationale(Manifest.permission.CAMERA) == true,
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getBoolean(REQUESTED, false),
  )

  // Public Android APIs cannot distinguish first request from "don't ask again" without local history.
  fun markRequested(context: Context): Boolean {
    val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    val previous = preferences.getBoolean(REQUESTED, false)
    if (preferences.edit().putBoolean(REQUESTED, true).commit()) return true
    preferences.edit().putBoolean(REQUESTED, previous).commit()
    return false
  }
}
