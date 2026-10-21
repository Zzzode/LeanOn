package com.zzzode.leanon.scanner

import org.junit.Assert.*
import org.junit.Test

class ProductBarcodeTest {
  @Test fun validGtinLengthsAndUpcAliasesAreCanonical() {
    assertEquals("96385074", ProductBarcode.normalize("96385074"))
    assertEquals("0036000291452", ProductBarcode.normalize("036000291452"))
    assertEquals("0036000291452", ProductBarcode.normalize("0036000291452"))
    assertEquals("3017620422003", ProductBarcode.normalize(" 3017620422003 "))
    assertEquals("10012345000017", ProductBarcode.normalize("10012345000017"))
  }

  @Test fun wrongChecksumAndNonProductPayloadsAreRejected() {
    for (value in listOf("", "abc", "3017620422004", "036000291453", "96385075", "10012345000018",
      "https://example.com", "12345", "３０１７６２０４２２００３", "3017620\n422003", "../3017620422003",
      "00000000", "000000000000", "0000000000000", "00000000000000")) {
      assertNull(value, ProductBarcode.normalize(value))
    }
  }

  @Test fun upcEIsExpandedBeforeChecksumAndCannotBeTreatedAsEan8() {
    assertEquals("0042100005264", ProductBarcode.normalizeUpcE("04252614"))
    assertNull(ProductBarcode.normalizeUpcE("04252615"))
    assertNull(ProductBarcode.normalizeUpcE("24252614"))
    assertNull(ProductBarcode.normalizeUpcE("0425261"))
  }
}
