package com.zzzode.leanon.modules

import android.content.Context
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.react.bridge.ReadableMap

/** Native module backing the `resource.*` methods; delegates to the bundle provider. */
class ResourceModule(context: Context) : LynxModule(context) {

  @LynxMethod
  fun fetch(params: ReadableMap, callback: Callback) {
    callback.invoke(JavaOnlyMap().apply {
      putString("code", "unavailable")
      putString("message", "This native capability is not implemented")
    })
  }
}
