package com.zzzode.leanon.scanner

import org.junit.Assert.*
import org.junit.Test

class BarcodeResultGateTest {
  @Test fun unreadableFramesDoNotStopScanAndDuplicateResultsDeliverOnce() {
    val gate = BarcodeResultGate()
    assertFalse(gate.accept(null)); assertTrue(gate.active)
    assertTrue(gate.accept("3017620422003")); assertFalse(gate.active)
    assertFalse(gate.accept("3017620422003")); assertFalse(gate.fail())
  }
  @Test fun cancellationAndFailureIgnoreLateFrameCallbacks() {
    val cancelled = BarcodeResultGate(); cancelled.close()
    assertFalse(cancelled.accept("3017620422003")); assertFalse(cancelled.fail())
    val failed = BarcodeResultGate(); assertTrue(failed.fail())
    assertFalse(failed.accept("3017620422003")); assertFalse(failed.fail())
  }
}
