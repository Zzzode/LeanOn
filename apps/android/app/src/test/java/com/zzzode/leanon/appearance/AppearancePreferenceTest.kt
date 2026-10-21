package com.zzzode.leanon.appearance

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppearancePreferenceTest {
  @Test fun missingOrMalformedStorageFollowsSystem() {
    for (value in listOf(null, "", "automatic", "DARK")) {
      val store = AppearancePreferenceStore({ value }, { true })
      assertEquals(AppearancePreference.SYSTEM, store.preference())
      assertEquals("light", store.preference().resolve(false))
      assertEquals("dark", store.preference().resolve(true))
    }
  }

  @Test fun explicitPreferencesIgnoreSystemChanges() {
    assertEquals("light", AppearancePreference.LIGHT.resolve(false))
    assertEquals("light", AppearancePreference.LIGHT.resolve(true))
    assertEquals("dark", AppearancePreference.DARK.resolve(false))
    assertEquals("dark", AppearancePreference.DARK.resolve(true))
  }

  @Test fun savedPreferenceSurvivesStoreRecreationAndCanReturnToSystem() {
    var saved: String? = null
    val store = AppearancePreferenceStore({ saved }, { saved = it; true })
    assertTrue(store.save("dark"))
    assertEquals(AppearancePreference.DARK, AppearancePreferenceStore({ saved }, { true }).preference())
    assertTrue(store.save("system"))
    assertEquals("light", store.preference().resolve(false))
    assertEquals("dark", store.preference().resolve(true))
  }

  @Test fun invalidRequestDoesNotWriteAndFailedCommitDoesNotChangePreference() {
    var writes = 0
    val store = AppearancePreferenceStore({ "light" }, { writes++; false })
    assertFalse(store.save("sepia"))
    assertFalse(store.save(null))
    assertEquals(0, writes)
    assertFalse(store.save("dark"))
    assertEquals(2, writes)
    assertEquals(AppearancePreference.LIGHT, store.preference())
  }

  @Test fun failedDiskCommitRestoresAnAlreadyUpdatedMemoryValue() {
    var inMemory: String? = "light"
    val store = AppearancePreferenceStore({ inMemory }, { inMemory = it; false })
    assertFalse(store.save("dark"))
    assertEquals("light", inMemory)
    assertEquals(AppearancePreference.LIGHT, store.preference())
    assertEquals(AppearancePreference.LIGHT, AppearancePreferenceStore({ inMemory }, { true }).preference())
  }
}
