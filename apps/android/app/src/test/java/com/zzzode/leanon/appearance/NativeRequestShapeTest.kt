package com.zzzode.leanon.appearance

import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.ReadableMap
import com.zzzode.leanon.modules.AppModule
import com.zzzode.leanon.modules.HealthConnectModule
import com.zzzode.leanon.modules.NotificationModule
import com.zzzode.leanon.modules.ScaleModule
import com.zzzode.leanon.modules.ScannerModule
import org.junit.Assert.assertNotNull
import org.junit.Test

class NativeRequestShapeTest {
  @Test fun voidRequestsAcceptTheTransportsRequestAndCallbackArguments() {
    val modules = listOf(
      AppModule::class.java to listOf("getInfo", "getCapabilities", "getAppearance"),
      NotificationModule::class.java to listOf("getSettings", "requestPermission"),
      HealthConnectModule::class.java to listOf("getStatus", "requestPermission", "sync"),
      ScaleModule::class.java to listOf("getStatus", "scan", "disconnect"),
      ScannerModule::class.java to listOf("scanBarcode"),
    )
    for ((module, methods) in modules) {
      for (method in methods) {
        assertNotNull(module.getMethod(method, ReadableMap::class.java, Callback::class.java))
      }
    }
  }
}
