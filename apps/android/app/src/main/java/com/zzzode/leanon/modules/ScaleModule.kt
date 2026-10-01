package com.zzzode.leanon.modules

import android.app.Activity
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
  private var actionCallback: Callback? = null

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
      val callback = actionCallback ?: return
      when (state) {
        BleState.SCANNING -> {
          val result = JavaOnlyMap()
          result.putBoolean("scanning", true)
          callback.invoke(result)
          actionCallback = null
        }
        BleState.CONNECTED -> {
          val result = JavaOnlyMap()
          result.putBoolean("connected", true)
          callback.invoke(result)
          actionCallback = null
        }
        else -> {}
      }
    }

    override fun onReading(deviceId: String, weightKg: Double) {
      val records = app().records
      val today = records.loadHostData().getString("today")
      val hostData = records.addWeight(today, weightKg)

      val reading = JavaOnlyMap()
      reading.putString("deviceId", deviceId)
      reading.putString("date", today)
      reading.putDouble("weightKg", weightKg)
      app().events.dispatch("scale.reading", reading)

      val changed = JavaOnlyMap()
      changed.putMap("hostData", hostData.toJavaOnlyMap())
      app().events.dispatch("records.changed", changed)
    }

    override fun onError(code: String, message: String) {
      val callback = actionCallback
      actionCallback = null
      callback?.invoke(errorResult(code, message))
    }
  }

  init {
    app().scaleManager.setListener(listener)
  }

  @LynxMethod
  fun scan(callback: Callback) {
    actionCallback = callback
    withPermission { app().scaleManager.startScan() }
  }

  @LynxMethod
  fun connect(params: ReadableMap, callback: Callback) {
    val deviceId = params.getString("deviceId")
    if (deviceId == null) {
      callback.invoke(errorResult("invalid-request", "Missing deviceId"))
      return
    }
    actionCallback = callback
    withPermission { app().scaleManager.connect(deviceId) }
  }

  @LynxMethod
  fun disconnect(callback: Callback) {
    app().scaleManager.disconnect()
    val result = JavaOnlyMap()
    result.putBoolean("connected", false)
    callback.invoke(result)
  }

  @LynxMethod
  fun getStatus(callback: Callback) {
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
    PermissionRequests.onResult = { granted ->
      if (granted) {
        action()
      } else {
        finishWithError("not-authorized", "Bluetooth permission denied")
      }
    }
    ActivityCompat.requestPermissions(
      currentActivity,
      BlePermissions.required(),
      PermissionRequests.REQUEST_CODE,
    )
  }

  private fun finishWithError(code: String, message: String) {
    val callback = actionCallback
    actionCallback = null
    callback?.invoke(errorResult(code, message))
  }

  private fun errorResult(code: String, message: String): JavaOnlyMap {
    val map = JavaOnlyMap()
    map.putString("code", code)
    map.putString("message", message)
    return map
  }
}
