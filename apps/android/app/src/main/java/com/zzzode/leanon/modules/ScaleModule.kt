package com.zzzode.leanon.modules

import android.content.Context
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.ReadableMap

/** Native module backing the `scale.*` methods; delegates to native/ble-scale. */
class ScaleModule(context: Context) : LynxModule(context) {

  @LynxMethod
  fun scan(callback: Callback) {
    // TODO: start BLE scan. Discovered devices are pushed via "scale.discovered";
    // callback {scanning: true}.
  }

  @LynxMethod
  fun connect(params: ReadableMap, callback: Callback) {
    // TODO: connect to {deviceId}; readings are pushed via "scale.reading".
  }
}
