package com.zzzode.leanon.scanner

import android.app.Activity
import android.content.Intent
import com.zzzode.leanon.bridge.PendingRequest

/**
 * Bridges the Lynx food page to the full-screen BarcodeScanActivity without an
 * Activity Result registry inside the module. Only one scan can be pending at a
 * time; the activity delivers the scanned barcode or an explicit cancellation/error
 * and the launcher forwards it to the waiting callback.
 */
sealed interface BarcodeScanResult {
  data class Found(val barcode: String) : BarcodeScanResult
  data object Cancelled : BarcodeScanResult
  data class Failure(val code: String, val message: String) : BarcodeScanResult
}

object BarcodeScanLauncher {
  private val pending = PendingRequest<BarcodeScanResult>()

  fun launch(activity: Activity, callback: (BarcodeScanResult) -> Unit): Boolean {
    if (!pending.begin(callback)) return false
    if (activity.isFinishing || activity.isDestroyed || !BarcodeCameraStatus.available(activity)) {
      pending.complete(BarcodeScanResult.Failure("unavailable", "Back camera or host is unavailable"))
      return true
    }
    try { activity.startActivity(Intent(activity, BarcodeScanActivity::class.java)) }
    catch (_: Exception) { pending.complete(BarcodeScanResult.Failure("unavailable", "Could not open camera scanner")) }
    return true
  }

  fun deliver(result: BarcodeScanResult) { pending.complete(result) }
}
