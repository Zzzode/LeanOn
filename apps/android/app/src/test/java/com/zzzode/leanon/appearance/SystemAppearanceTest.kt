package com.zzzode.leanon.appearance

import android.app.UiModeManager
import android.content.res.Configuration
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SystemAppearanceTest {
  @Test fun explicitSystemModeWinsOverUndefinedOrStaleApplicationConfiguration() {
    assertTrue(systemAppearanceIsDark(UiModeManager.MODE_NIGHT_YES, Configuration.UI_MODE_NIGHT_UNDEFINED))
    assertFalse(systemAppearanceIsDark(UiModeManager.MODE_NIGHT_NO, Configuration.UI_MODE_NIGHT_YES))
  }

  @Test fun ScheduledAndAutomaticModesUseTheResolvedConfiguration() {
    for (mode in listOf(UiModeManager.MODE_NIGHT_AUTO, UiModeManager.MODE_NIGHT_CUSTOM)) {
      assertTrue(systemAppearanceIsDark(mode, Configuration.UI_MODE_NIGHT_YES))
      assertFalse(systemAppearanceIsDark(mode, Configuration.UI_MODE_NIGHT_NO))
    }
  }
}
