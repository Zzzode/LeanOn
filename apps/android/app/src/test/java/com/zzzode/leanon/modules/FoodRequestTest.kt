package com.zzzode.leanon.modules

import com.lynx.react.bridge.JavaOnlyMap
import org.junit.Assert.*
import org.junit.Test

class FoodRequestTest {
  @Test fun typedBarcodeIsValidatedAndUpcNormalizedBeforeNetwork() {
    assertEquals("0036000291452", productBarcode(JavaOnlyMap.from(mapOf("barcode" to "036000291452"))))
    assertEquals("3017620422003", productBarcode(JavaOnlyMap.from(mapOf("barcode" to "3017620422003"))))
  }
  @Test fun missingNullWrongTypesAndInvalidCodesNeverUseTypedStringGetter() {
    assertNull(productBarcode(null))
    assertNull(productBarcode(JavaOnlyMap()))
    for (value in listOf<Any?>(null, true, 3017620422003L, JavaOnlyMap(), "", "3017620422004", "../code")) {
      assertNull(productBarcode(JavaOnlyMap.from(mapOf("barcode" to value))))
    }
  }
}
