package com.zzzode.leanon.scanner

import android.app.Activity
import android.content.Intent

/**
 * Bridges the Lynx food page to the full-screen BarcodeScanActivity without an
 * Activity Result registry inside the module. Only one scan can be pending at a
 * time; the activity delivers the scanned barcode (null when the user cancels)
 * and the launcher forwards it to the waiting callback.
 */
object BarcodeScanLauncher {
  private var pending: ((String?) -> Unit)? = null

  fun launch(activity: Activity, callback: (String?) -> Unit) {
    pending = callback
    activity.startActivity(Intent(activity, BarcodeScanActivity::class.java))
  }

  fun deliver(barcode: String?) {
    val callback = pending
    pending = null
    callback?.invoke(barcode)
  }
}
