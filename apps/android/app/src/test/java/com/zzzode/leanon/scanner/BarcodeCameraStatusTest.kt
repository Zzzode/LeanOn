package com.zzzode.leanon.scanner

import org.junit.Assert.assertEquals
import org.junit.Test

class BarcodeCameraStatusTest {
  @Test fun statusSeparatesFirstRequestGrantDenialAndPolicyRestriction() {
    assertEquals(CameraPermission.NOT_DETERMINED, cameraPermission(false, false, false, false))
    assertEquals(CameraPermission.AUTHORIZED, cameraPermission(true, false, false, true))
    assertEquals(CameraPermission.DENIED, cameraPermission(false, false, true, false))
    assertEquals(CameraPermission.DENIED, cameraPermission(false, false, false, true))
    assertEquals(CameraPermission.RESTRICTED, cameraPermission(false, true, false, false))
  }
}
