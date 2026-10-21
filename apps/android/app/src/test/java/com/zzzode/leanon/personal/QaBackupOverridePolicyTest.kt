package com.zzzode.leanon.personal

import java.io.File
import org.junit.Assert.*
import org.junit.Test

class QaBackupOverridePolicyTest {
  @Test fun releaseAndProductionPackageAlwaysRejectOverrides() {
    val cache = File("/tmp/public-qa-cache"); val fixture = File(cache, "personal-ui")
    assertFalse(qaBackupOverrideAllowed(false, "com.zzzode.leanon.uiqa", cache, fixture))
    assertFalse(qaBackupOverrideAllowed(true, "com.zzzode.leanon", cache, fixture))
    assertTrue(qaBackupOverrideAllowed(true, "com.zzzode.leanon.uiqa", cache, fixture))
  }
  @Test fun OnlyNamedCacheNamespacesAreAllowedAndTraversalCannotEscape() {
    val cache = File("/tmp/public-qa-cache")
    assertTrue(qaBackupOverrideAllowed(true, "com.zzzode.leanon.uiqa", cache, File(cache, "companion-ui")))
    for (fixture in listOf(File(cache, "other"), File("/tmp/personal-ui"), File(cache, "../personal-ui")))
      assertFalse(qaBackupOverrideAllowed(true, "com.zzzode.leanon.uiqa", cache, fixture))
  }
  @Test fun accessibilityFixtureIsSeparateAndNeverAcceptedByReleaseOrProduction() {
    val cache = File("/tmp/public-qa-cache"); val fixture = File(cache, "a11y-ui")
    assertTrue(qaBackupOverrideAllowed(true, "com.zzzode.leanon.uiqa", cache, fixture))
    assertFalse(qaBackupOverrideAllowed(false, "com.zzzode.leanon.uiqa", cache, fixture))
    assertFalse(qaBackupOverrideAllowed(true, "com.zzzode.leanon", cache, fixture))
    assertFalse(qaBackupOverrideAllowed(true, "com.zzzode.leanon.uiqa", cache, File(cache, "../a11y-ui")))
  }

}
