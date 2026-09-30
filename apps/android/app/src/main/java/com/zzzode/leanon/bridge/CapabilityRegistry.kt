package com.zzzode.leanon.bridge

/**
 * Single source of truth, on the Android side, for the methods and events the
 * host implements. Keep these lists in sync with `LeanOnRpcContract` and
 * `LeanOnEventContract` in packages/bridge/src/contracts.ts.
 */
class CapabilityRegistry {

  val supportedMethods: List<String> = listOf(
    "health.authorize",
    "health.readSamples",
    "health.writeWeight",
    "scale.scan",
    "scale.connect",
    "storage.get",
    "storage.set",
    "storage.remove",
    "resource.fetch",
    "app.getInfo",
    "app.getCapabilities",
    "notification.schedule",
  )

  val supportedEvents: List<String> = listOf(
    "health.authorizationChanged",
    "scale.discovered",
    "scale.reading",
    "app.lifecycle",
  )

  val bridgeVersion: String = "0.1.0"

  fun supportsMethod(method: String): Boolean = supportedMethods.contains(method)

  fun supportsEvent(event: String): Boolean = supportedEvents.contains(event)
}
