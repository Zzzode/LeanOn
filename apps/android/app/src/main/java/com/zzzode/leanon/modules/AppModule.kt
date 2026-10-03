package com.zzzode.leanon.modules

import android.content.Context
import android.os.Build
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.ReadableMap
import com.zzzode.leanon.LeanOnApplication

/** Native module backing the `app.*` methods. */
class AppModule(context: Context) : LynxModule(context) {

  @LynxMethod
  fun getInfo(callback: Callback) {
    callback.invoke(
      mapOf(
        "platform" to "android",
        "hostVersion" to "0.1.0",
        "osVersion" to Build.VERSION.RELEASE,
        "deviceModel" to Build.MODEL,
      ),
    )
  }

  @LynxMethod
  fun getCapabilities(callback: Callback) {
    val app = mContext.applicationContext as LeanOnApplication
    val caps = app.capabilities
    callback.invoke(
      mapOf(
        "bridgeVersion" to caps.bridgeVersion,
        "supportedMethods" to caps.supportedMethods,
        "supportedEvents" to caps.supportedEvents,
      ),
    )
  }

  @LynxMethod
  fun openRoute(params: ReadableMap, callback: Callback) {
    val app = mContext.applicationContext as LeanOnApplication
    val route = params.getString("route")
    val opened = route != null && app.router.open(route)
    callback.invoke(mapOf("success" to opened))
  }
}
