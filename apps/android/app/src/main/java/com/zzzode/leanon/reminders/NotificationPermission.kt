package com.zzzode.leanon.reminders

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat

/**
 * Runtime notification permission for Android 13+ (API 33). Earlier versions
 * need no runtime grant. Uses the same activity-result bridge pattern as BLE.
 */
object NotificationPermission {

  const val REQUEST_CODE = 4021

  var onResult: ((granted: Boolean) -> Unit)? = null

  fun required(): Array<String> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      arrayOf(Manifest.permission.POST_NOTIFICATIONS)
    } else {
      emptyArray()
    }

  fun areGranted(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
    return ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.POST_NOTIFICATIONS,
    ) == PackageManager.PERMISSION_GRANTED
  }

  fun handleResult(requestCode: Int, grantResults: IntArray) {
    if (requestCode != REQUEST_CODE) return
    val granted =
      grantResults.isNotEmpty() &&
        grantResults.all { it == PackageManager.PERMISSION_GRANTED }
    val callback = onResult
    onResult = null
    callback?.invoke(granted)
  }
}
