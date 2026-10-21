package com.zzzode.leanon

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TabBarMotionTest {
  @Test fun tapCommitsOnlyThePressedTab() {
    val gesture = TabBarGesture(8f)
    gesture.begin(220f, 30f, 2, 220f)
    assertNull(gesture.move(225f, 32f))
    assertFalse(gesture.isDragging)
    assertEquals(2, gesture.release(2, 2))
    assertNull(gesture.release(3, 3))
  }

  @Test fun firstDragMovementIsPreservedAndReleaseUsesThePreview() {
    val gesture = TabBarGesture(8f)
    gesture.begin(105f, 30f, 0, 100f)
    assertEquals(120f, gesture.move(125f, 31f)!!, 0f)
    assertTrue(gesture.isDragging)
    assertEquals(360f, gesture.move(365f, 32f)!!, 0f)
    assertEquals(4, gesture.release(3, 4))
  }

  @Test fun verticalMovementCancelsWithoutCommitting() {
    val gesture = TabBarGesture(8f)
    gesture.begin(100f, 30f, 0, 100f)
    assertNull(gesture.move(105f, 50f))
    assertTrue(gesture.isCanceled)
    assertNull(gesture.move(400f, 50f))
    assertNull(gesture.release(4, 4))
  }

  @Test fun cancellationDoesNotCommitTheHoveredTab() {
    val gesture = TabBarGesture(8f)
    gesture.begin(100f, 30f, 0, 100f)
    gesture.move(400f, 30f)
    gesture.cancel()
    assertNull(gesture.release(4, 4))
  }

  @Test fun releaseCommitsTheFinalCoordinateWhenTheLastMoveWasInThePreviousTab() {
    val gesture = TabBarGesture(8f)
    gesture.begin(100f, 30f, 0, 100f)
    assertEquals(220f, gesture.move(220f, 30f)!!, 0f)
    // The UI resolves the release coordinate independently of the previous preview.
    assertEquals(3, gesture.release(3, 3))
  }

  @Test fun newPressAfterCancellationHasItsOwnAnchor() {
    val gesture = TabBarGesture(8f)
    gesture.begin(100f, 30f, 0, 100f)
    gesture.cancel()
    gesture.begin(310f, 30f, 3, 300f)
    assertFalse(gesture.isCanceled)
    assertEquals(280f, gesture.move(290f, 30f)!!, 0f)
    assertEquals(2, gesture.release(2, 2))
  }

  @Test fun springRetargetingPreservesTheCurrentPositionAndVelocity() {
    val spring = TabBarSpring(0.8f, 500f, 0.25f)
    spring.snapTo(100f)
    spring.target = 400f
    repeat(4) { spring.advance(1f / 60f) }
    val position = spring.value
    val velocity = spring.velocity
    assertTrue(position > 100f && position < 400f)
    assertTrue(velocity > 0f)
    spring.target = 200f
    assertEquals(position, spring.value, 0f)
    assertEquals(velocity, spring.velocity, 0f)
    repeat(120) { spring.advance(1f / 60f) }
    assertTrue(spring.isSettled)
    assertEquals(200f, spring.value, 0.25f)
  }

  @Test fun frameRatesProduceTheSameSettledDestination() {
    for (fps in listOf(30, 60, 120)) {
      val spring = TabBarSpring(0.5f, 600f, 0.002f)
      spring.target = 1f
      repeat(fps) { spring.advance(1f / fps) }
      assertTrue("Spring should settle at $fps fps", spring.isSettled)
      assertEquals(1f, spring.value, 0.002f)
    }
  }

  @Test fun delayedFrameCannotExplodeTheAnimation() {
    val spring = TabBarSpring(0.8f, 500f, 0.25f)
    spring.target = 400f
    spring.advance(2f)
    assertTrue(spring.value.isFinite())
    assertTrue(spring.value in 0f..450f)
    repeat(120) { spring.advance(1f / 60f) }
    assertEquals(400f, spring.value, 0.25f)
  }

  @Test fun interruptedPressSettlesBackToRest() {
    val pressure = TabBarSpring(0.5f, 600f, 0.002f)
    pressure.target = 1f
    repeat(3) { pressure.advance(1f / 60f) }
    pressure.target = 0f
    repeat(120) { pressure.advance(1f / 60f) }
    assertTrue(pressure.isSettled)
    assertEquals(0f, pressure.value, 0.002f)
  }

  @Test fun capsuleExpansionAndContractionEachHaveOneVisibleElasticPeak() {
    for (fps in listOf(30, 60, 120)) {
      val spring = TabBarSpring(0.5f, 600f, 0.002f)
      spring.target = 1f
      var peak = 0f
      var expansionPulses = 0
      var abovePeakThreshold = false
      repeat(fps) {
        spring.advance(1f / fps)
        peak = maxOf(peak, spring.value)
        val above = spring.value > 1.06f
        if (above && !abovePeakThreshold) expansionPulses++
        abovePeakThreshold = above
      }
      assertTrue("Expansion should visibly overshoot at $fps fps", peak > 1.06f)
      assertTrue("Expansion should remain controlled at $fps fps", peak < 1.2f)
      assertEquals("Expansion should have one visible pulse at $fps fps", 1, expansionPulses)
      assertTrue(spring.isSettled)
      spring.target = 0f
      var trough = 0f
      var contractionPulses = 0
      var belowTroughThreshold = false
      repeat(fps) {
        spring.advance(1f / fps)
        trough = minOf(trough, spring.value)
        val below = spring.value < -0.06f
        if (below && !belowTroughThreshold) contractionPulses++
        belowTroughThreshold = below
      }
      assertTrue("Contraction should compress below rest at $fps fps", trough < -0.06f)
      assertTrue("Contraction should remain controlled at $fps fps", trough > -0.2f)
      assertEquals("Contraction should have one visible pulse at $fps fps", 1, contractionPulses)
      assertTrue(spring.isSettled)
      assertEquals(0f, spring.value, 0.002f)
    }
  }

  @Test fun quickTapReachesAnElasticExpansionBeforeReturningToRest() {
    val spring = TabBarSpring(0.5f, 600f, 0.002f)
    spring.target = 1f
    var peak = 0f
    repeat(10) {
      spring.advance(0.016f)
      peak = maxOf(peak, spring.value)
    }
    assertTrue("A 160ms press should include the expansion peak", peak > 1.06f)
    spring.target = 0f
    val releaseValue = spring.value
    val releaseVelocity = spring.velocity
    assertTrue(releaseValue > 1f)
    spring.advance(0.016f)
    assertTrue(spring.value.isFinite())
    assertTrue(spring.value < releaseValue)
    assertTrue(spring.velocity < releaseVelocity)
    repeat(120) { spring.advance(1f / 60f) }
    assertTrue(spring.isSettled)
    assertEquals(0f, spring.value, 0.002f)
  }

  @Test fun elapsedTimeProducesTheSameCurveAcrossFrameRatesAndDelayedFrames() {
    val expected = TabBarSpring(0.72f, 1000f, 0.0001f)
    expected.target = 180f
    expected.advance(0.15f)
    for (fps in listOf(30, 60, 120)) {
      val spring = TabBarSpring(0.72f, 1000f, 0.0001f)
      spring.target = 180f
      val wholeFrames = (0.15f * fps).toInt()
      repeat(wholeFrames) { spring.advance(1f / fps) }
      spring.advance(0.15f - wholeFrames.toFloat() / fps)
      assertEquals("Position at $fps fps", expected.value, spring.value, 0.001f)
      assertEquals("Velocity at $fps fps", expected.velocity, spring.velocity, 0.01f)
    }
  }

  @Test fun quickTapExpandsAtTheSourceThenTravelsAndReboundsOnce() {
    val motion = TabBarMotion()
    motion.finish(100f)
    motion.press(280f, 0L)
    motion.release(tap = true, 20_000_000L)
    assertEquals(100f, motion.position.value, 0f)
    assertTrue(motion.pressure.value > 0f)
    motion.advance(40_000_000L)
    assertEquals(100f, motion.position.value, 0f)
    motion.advance(150_000_000L)
    assertTrue(motion.position.value > 262f)
    assertEquals(1f, motion.pressure.target, 0f)
    motion.advance(190_000_000L)
    assertTrue(motion.pressure.value > 1f)
    assertEquals(0f, motion.pressure.target, 0f)
    motion.advance(350_000_000L)
    assertTrue(motion.pressure.value < 0f)
    motion.advance(900_000_000L)
    assertFalse(motion.isAnimating)
    assertEquals(280f, motion.position.value, 0f)
    assertEquals(0f, motion.pressure.value, 0f)
  }

  @Test fun delayedFrameCrossesTravelAndReleaseBoundariesAtTheirActualTimes() {
    val expected = TabBarMotion()
    expected.finish(100f)
    expected.press(280f, 0L)
    expected.release(tap = true, 20_000_000L)
    for (fps in listOf(30, 60, 120)) {
      val motion = TabBarMotion()
      motion.finish(100f)
      motion.press(280f, 0L)
      motion.release(tap = true, 20_000_000L)
      var nanos = 20_000_000L
      while (nanos + 1_000_000_000L / fps < 350_000_000L) {
        nanos += 1_000_000_000L / fps
        motion.advance(nanos)
      }
      motion.advance(350_000_000L)
      expected.advance(350_000_000L)
      assertEquals(expected.position.value, motion.position.value, 0.001f)
      assertEquals(expected.pressure.value, motion.pressure.value, 0.0001f)
      assertEquals(0f, motion.pressure.target, 0f)
    }
  }

  @Test fun settledLongPressContractsImmediatelyOnRelease() {
    val motion = TabBarMotion()
    motion.finish(100f)
    motion.press(100f, 0L)
    motion.advance(800_000_000L)
    assertEquals(1f, motion.pressure.value, 0f)
    motion.release(tap = true, 800_000_000L)
    assertEquals(0f, motion.pressure.target, 0f)
    motion.advance(850_000_000L)
    assertTrue(motion.pressure.value in 0f..0.9f)
  }

  @Test fun dragPauseHoldsTheFingerPositionAndReleasePreservesMomentum() {
    val motion = TabBarMotion()
    motion.finish(100f)
    motion.press(100f, 0L)
    motion.drag(240f, 400f, 0.1f, 100_000_000L)
    motion.advance(200_000_000L)
    assertEquals(240f, motion.position.value, 0f)
    assertEquals(400f, motion.position.velocity, 0f)
    motion.release(tap = false, 200_000_000L)
    motion.moveTo(250f, 200_000_000L)
    assertEquals(400f, motion.position.velocity, 0f)
    motion.advance(210_000_000L)
    assertTrue(motion.position.value > 242f)
    assertEquals(0f, motion.pressure.target, 0f)
  }

  @Test fun aFastReleaseCannotEscapeThePlatter() {
    val motion = TabBarMotion()
    motion.setBounds(96f, 404f)
    motion.finish(100f)
    motion.press(100f, 0L)
    motion.drag(390f, 2000f, 0.18f, 100_000_000L)
    motion.release(tap = false, 100_000_000L)
    motion.moveTo(400f, 100_000_000L)
    repeat(60) {
      motion.advance(100_000_000L + (it + 1) * 16_666_667L)
      assertTrue(motion.position.value in 96f..404f)
    }
    assertEquals(400f, motion.position.value, 0f)
  }

  @Test fun cancellationRestoresSelectionAndRemovesThePendingTap() {
    val motion = TabBarMotion()
    motion.finish(100f)
    motion.press(280f, 0L)
    motion.release(tap = true, 10_000_000L)
    motion.cancel(100f, 20_000_000L)
    motion.advance(900_000_000L)
    assertEquals(100f, motion.position.value, 0f)
    assertEquals(0f, motion.pressure.value, 0f)
    assertFalse(motion.isAnimating)
  }

  @Test fun rapidRepressAndFinishCannotInheritAnEarlierRelease() {
    val motion = TabBarMotion()
    motion.finish(100f)
    motion.press(280f, 0L)
    motion.release(tap = true, 10_000_000L)
    motion.press(460f, 60_000_000L)
    motion.advance(900_000_000L)
    assertEquals(460f, motion.position.value, 0f)
    assertEquals(1f, motion.pressure.value, 0f)
    motion.release(tap = true, 910_000_000L)
    motion.finish(100f)
    motion.advance(2_000_000_000L)
    assertEquals(100f, motion.position.value, 0f)
    assertEquals(0f, motion.pressure.value, 0f)
    assertFalse(motion.isAnimating)
  }

  @Test fun pressingDuringTravelRetargetsWithoutBrakingOrFollowingTheOldDestination() {
    val motion = TabBarMotion()
    motion.finish(100f)
    motion.press(460f, 0L)
    motion.release(tap = true, 10_000_000L)
    motion.advance(80_000_000L)
    val value = motion.position.value
    val velocity = motion.position.velocity
    motion.press(100f, 80_000_000L)
    assertFalse(motion.isTravelDelayed)
    assertEquals(value, motion.position.value, 0f)
    assertEquals(velocity, motion.position.velocity, 0f)
    assertEquals(100f, motion.position.target, 0f)
  }

  @Test fun peakTimeSkipsTheInitialValleyWhenExpansionStartsWithNegativeVelocity() {
    val pressure = TabBarSpring(0.55f, 500f, 0.002f)
    pressure.follow(0.5f, -10f)
    pressure.target = 1f
    val peakTime = pressure.secondsUntilPeak()
    pressure.advance(0.02f)
    assertTrue(pressure.value < 0.5f)
    pressure.advance(peakTime - 0.02f)
    assertTrue(pressure.value > 1f)
    assertEquals(0f, pressure.velocity, 0.001f)
  }

  @Test fun quickRepressDuringContractionStillCompletesAnExpansionBeforeRelease() {
    val motion = TabBarMotion()
    motion.finish(100f)
    motion.press(100f, 0L)
    motion.release(tap = true, 20_000_000L)
    motion.advance(250_000_000L)
    assertTrue(motion.pressure.velocity < 0f)
    motion.press(280f, 250_000_000L)
    val peakAt = 250_000_000L +
      (motion.pressure.secondsUntilPeak() * 1_000_000_000.0).toLong()
    motion.release(tap = true, 260_000_000L)
    motion.advance(300_000_000L)
    assertEquals(1f, motion.pressure.target, 0f)
    motion.advance(peakAt + 1_000L)
    assertTrue(motion.pressure.value > 1f)
    assertEquals(0f, motion.pressure.target, 0f)
    motion.advance(1_500_000_000L)
    assertFalse(motion.isAnimating)
  }
}
