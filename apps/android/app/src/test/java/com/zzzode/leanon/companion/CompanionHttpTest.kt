package com.zzzode.leanon.companion

import org.junit.Assert.*
import org.junit.Test

class CompanionHttpTest {
  @Test fun endpointPortsAndLocalPlainHttpBoundaries() {
    assertEquals("http://10.0.2.2:8787", CompanionHttp.validateEndpoint("http://10.0.2.2:8787/"))
    assertEquals("https://example.invalid", CompanionHttp.validateEndpoint("https://example.invalid"))
    for (value in listOf("http://127.0.0.1:0", "http://127.0.0.1:65536", "https://example.invalid:99999", "http://example.invalid", "https://user:password@example.invalid", "https://example.invalid?token=secret", "https://example.invalid/health"))
      assertThrows(value, CompanionFailure::class.java) { CompanionHttp.validateEndpoint(value) }
  }
}
