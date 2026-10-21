package com.zzzode.leanon.modules

import android.app.Activity
import android.util.Log
import android.content.Context
import androidx.core.app.ActivityCompat
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.react.bridge.ReadableMap
import com.lynx.tasm.behavior.LynxContext
import com.zzzode.leanon.LeanOnApplication
import com.zzzode.leanon.ble.BlePermissions
import com.zzzode.leanon.ble.BleScaleListener
import com.zzzode.leanon.ble.BleState
import com.zzzode.leanon.ble.PermissionRequests
import com.zzzode.leanon.ble.ScaleDevice
import com.zzzode.leanon.data.toJavaOnlyMap

/** Native module backing the `scale.*` methods; delegates to the BLE scale manager. */
class ScaleModule(context: Context) : LynxModule(context) {

  private val moduleContext: Context = context
  private val actions get() = app().scaleManager.pendingAction

  private fun androidContext(): Context =
    (moduleContext as? LynxContext)?.getContext() ?: moduleContext

  private fun app(): LeanOnApplication =
    androidContext().applicationContext as LeanOnApplication

  private fun activity(): Activity? = androidContext() as? Activity

  private val listener = object : BleScaleListener {
    override fun onDeviceFound(device: ScaleDevice) {
      val payload = JavaOnlyMap()
      payload.putString("deviceId", device.deviceId)
      payload.putString("name", device.name)
      payload.putDouble("rssi", device.rssi.toDouble())
      app().events.dispatch("scale.discovered", payload)
    }

    override fun onStateChanged(state: BleState) {
      when (state) {
        BleState.SCANNING -> actions.complete(JavaOnlyMap().apply { putBoolean("scanning", true) })
        BleState.CONNECTED -> actions.complete(JavaOnlyMap().apply { putBoolean("connected", true) })
        else -> Unit
      }
    }

    override fun onReading(deviceId: String, weightKg: Double) {
      try {
        if (!weightKg.isFinite() || weightKg < 20.0 || weightKg > 300.0) return
        val records = app().records
        val today = records.currentSnapshot().getString("today")
        val hostData = records.addWeight(today, weightKg)
        val reading = JavaOnlyMap().apply {
          putString("deviceId", deviceId); putString("date", today); putDouble("weightKg", weightKg)
        }
        app().events.dispatch("scale.reading", reading)
        app().events.dispatch("records.changed", JavaOnlyMap().apply { putMap("hostData", hostData.toJavaOnlyMap()) })
        app().healthConnect.onRecordsChanged()
      } catch (error: Exception) {
        Log.w("ScaleModule", "Could not persist scale reading", error)
      }
    }

    override fun onError(code: String, message: String) {
      actions.complete(errorResult(code, message))
    }
  }

  init {
    app().scaleManager.setListener(listener)
  }

  @LynxMethod
  @Suppress("UNUSED_PARAMETER")
  fun scan(params: ReadableMap?, callback: Callback) {
    if (!actions.begin { result -> callback.invoke(result) }) {
      callback.invoke(errorResult("unavailable", "Scale action already pending"))
      return
    }
    withPermission {
      val manager = app().scaleManager
      if (manager.getState() == BleState.SCANNING) actions.complete(JavaOnlyMap().apply { putBoolean("scanning", true) })
      else manager.startScan()
    }
  }

  @LynxMethod
  fun connect(params: ReadableMap, callback: Callback) {
    val deviceId = try { RecordRequest.string(params, "deviceId") } catch (error: InvalidRecordRequest) {
      callback.invoke(errorResult("invalid-request", error.message ?: "Invalid deviceId")); return
    }
    if (!actions.begin { result -> callback.invoke(result) }) {
      callback.invoke(errorResult("unavailable", "Scale action already pending"))
      return
    }
    withPermission { app().scaleManager.connect(deviceId) }
  }

  @LynxMethod
  @Suppress("UNUSED_PARAMETER")
  fun disconnect(params: ReadableMap?, callback: Callback) {
    app().scaleManager.disconnect()
    val result = JavaOnlyMap()
    result.putBoolean("connected", false)
    callback.invoke(result)
  }

  @LynxMethod
  @Suppress("UNUSED_PARAMETER")
  fun getStatus(params: ReadableMap?, callback: Callback) {
    val manager = app().scaleManager
    val result = JavaOnlyMap()
    result.putString("state", manager.getState().wire())
    val paired = manager.getPairedDeviceId()
    if (paired == null) result.putNull("pairedDeviceId")
    else result.putString("pairedDeviceId", paired)
    callback.invoke(result)
  }

  private fun withPermission(action: () -> Unit) {
    val application = app()
    if (BlePermissions.areGranted(application)) {
      action()
      return
    }
    val currentActivity = activity()
    if (currentActivity == null) {
      finishWithError("not-authorized", "Bluetooth permission denied")
      return
    }
    currentActivity.runOnUiThread {
      if (!PermissionRequests.begin { granted ->
          if (granted) action() else finishWithError("not-authorized", "Bluetooth permission denied")
        }) {
        finishWithError("unavailable", "Bluetooth permission request already pending")
        return@runOnUiThread
      }
      try {
        ActivityCompat.requestPermissions(currentActivity, BlePermissions.required(), PermissionRequests.REQUEST_CODE)
      } catch (_: Exception) { PermissionRequests.cancel() }
    }
  }

  private fun finishWithError(code: String, message: String) {
    actions.complete(errorResult(code, message))
  }

  private fun errorResult(code: String, message: String): JavaOnlyMap {
    val map = JavaOnlyMap()
    map.putString("code", code)
    map.putString("message", message)
    return map
  }
}
