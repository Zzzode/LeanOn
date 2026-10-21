package com.zzzode.leanon.personal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.IOException

class BoundedPhotoDecoderTest {
  @Test fun preservesSmallPixelsAndBoundsLargeCanonicalDimensions() {
    assertEquals(1, photoPreviewSampleSize(24, 18))
    assertEquals(1, photoPreviewSampleSize(2048, 2048))
    assertEquals(16, photoPreviewSampleSize(20000, 20000))
    assertEquals(8, photoPreviewSampleSize(20000, 10000))
    assertThrows(IOException::class.java) { photoPreviewSampleSize(0, 18) }
    assertThrows(IOException::class.java) { photoPreviewSampleSize(20001, 18) }
  }
}
