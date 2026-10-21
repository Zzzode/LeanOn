package com.zzzode.leanon.bridge

import org.junit.Assert.*
import org.junit.Test

class CapabilityRegistryTest {
  @Test fun unfinishedStubsAreNotAdvertisedWhileImplementedCapabilitiesRemain() {
    val registry = CapabilityRegistry()
    for (method in listOf("health.authorize", "health.readSamples", "storage.get", "storage.set", "storage.remove", "resource.fetch")) {
      assertFalse(method, registry.supportsMethod(method))
    }
    for (method in listOf("health.writeWater", "health.writeCustomFood", "health.setFoodFavorite", "health.writeScannedFood",
      "scanner.scanBarcode", "food.lookupProduct", "healthConnect.sync", "notification.updateSettings", "scale.scan")) {
      assertTrue(method, registry.supportsMethod(method))
    }
  }
}
