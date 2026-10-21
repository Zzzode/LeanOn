package com.zzzode.leanon.appearance

import com.lynx.react.bridge.JavaOnlyMap
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppearanceRequestTest {
  @Test fun wrongTypedOrMissingPreferenceIsInvalid() {
    assertNull(readAppearancePreference(JavaOnlyMap()))
    for (value in listOf(null, true, 2, 2.5, JavaOnlyMap(), "sepia")) {
      assertNull(readAppearancePreference(JavaOnlyMap.from(mapOf("preference" to value))))
    }
  }

  @Test fun supportedStringsProduceTheTypedPreference() {
    for (preference in AppearancePreference.entries) {
      assertEquals(preference, readAppearancePreference(JavaOnlyMap.from(mapOf("preference" to preference.value))))
    }
  }
}
