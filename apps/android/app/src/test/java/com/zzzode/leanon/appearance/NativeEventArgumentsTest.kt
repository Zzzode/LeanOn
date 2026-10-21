package com.zzzode.leanon.appearance

import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.react.bridge.ReadableType
import com.zzzode.leanon.bridge.nativeEventArguments
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class NativeEventArgumentsTest {
  @Test fun appearanceAndDismissalMapsAreReadableSdkObjects() {
    val appearance = nativeEventArguments(mapOf("preference" to "system", "resolved" to "dark"))
    assertEquals(1, appearance.size)
    assertEquals(ReadableType.Map, appearance.getType(0))
    assertEquals("system", appearance.getMap(0).getString("preference"))
    assertEquals("dark", appearance.getMap(0).getString("resolved"))
    assertEquals("back", nativeEventArguments(mapOf("reason" to "back")).getMap(0).getString("reason"))
  }

  @Test fun nestedMapsConvertAndExistingReadableObjectsRemainIntact() {
    val payload = nativeEventArguments(mapOf("hostData" to mapOf("today" to "2026-10-01")))
    assertEquals("2026-10-01", payload.getMap(0).getMap("hostData").getString("today"))
    val existing = JavaOnlyMap.from(mapOf("resolved" to "light"))
    assertSame(existing, nativeEventArguments(existing).getMap(0))
  }
}
