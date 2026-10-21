package com.zzzode.leanon.modules

import android.content.Context
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.react.bridge.ReadableMap

/** Reserved `storage.*` adapter (RFC 0008); encrypted storage is not implemented or advertised. */
class StorageModule(context: Context) : LynxModule(context) {

  @LynxMethod
  fun get(params: ReadableMap, callback: Callback) {
    callback.invoke(JavaOnlyMap().apply {
      putString("code", "unavailable")
      putString("message", "This native capability is not implemented")
    })
  }

  @LynxMethod
  fun set(params: ReadableMap, callback: Callback) {
    callback.invoke(JavaOnlyMap().apply {
      putString("code", "unavailable")
      putString("message", "This native capability is not implemented")
    })
  }

  @LynxMethod
  fun remove(params: ReadableMap, callback: Callback) {
    callback.invoke(JavaOnlyMap().apply {
      putString("code", "unavailable")
      putString("message", "This native capability is not implemented")
    })
  }
}
