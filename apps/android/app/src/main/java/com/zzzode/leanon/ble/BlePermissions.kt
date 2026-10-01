package com.zzzode.leanon.ble

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat

/** Runtime permissions required for BLE scanning/connection by platform version. */
object BlePermissions {

  /**
   * API 31+ uses the split Bluetooth permissions; API 26-30 requires location to
   * receive scan results.
   */
  fun required(): Array<String> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      arrayOf(
        Manifest.permission.BLUETOOTH_SCAN,
        Manifest.permission.BLUETOOTH_CONNECT,
      )
    } else {
      arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
    }

  fun areGranted(context: Context): Boolean = required().all { permission ->
    ContextCompat.checkSelfPermission(context, permission) ==
      PackageManager.PERMISSION_GRANTED
  }
}

/**
 * Bridges the asynchronous [android.app.Activity.onRequestPermissionsResult]
 * callback back to the native module that started the BLE action.
 */
object PermissionRequests {

  const val REQUEST_CODE = 4011

  var onResult: ((granted: Boolean) -> Unit)? = null

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
