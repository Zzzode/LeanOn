package com.zzzode.leanon.companion

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class CompanionVaultMergeTest {
  private fun fixture() = JSONObject(javaClass.getResource("/companion/public-vault-merge-v1.json")!!.readText())
  @Test fun publicCrossPlatformCasesMatchExactReference() {
    val cases = fixture().getJSONArray("cases")
    assertEquals(8, cases.length())
    for (i in 0 until cases.length()) {
      val case = cases.getJSONObject(i)
      if (case.optBoolean("expectedError")) assertThrows(case.getString("name"), IOException::class.java) {
        CompanionVaultMerge.merge(case.getJSONObject("local"), case.getJSONObject("remote"))
      } else assertEquals(case.getString("name"), CompanionVaultMerge.canonical(case.getJSONObject("expected")),
        CompanionVaultMerge.canonical(CompanionVaultMerge.merge(case.getJSONObject("local"), case.getJSONObject("remote"))))
    }
  }
  @Test fun deletedHigherClockDoesNotHideNewSameDateRecord() {
    val cases = fixture().getJSONArray("cases")
    val case = (0 until cases.length()).map { cases.getJSONObject(it) }.single { it.getString("name") == "tombstone-beats-live" }
    val local = case.getJSONObject("local"); val remote = case.getJSONObject("remote")
    val rows = local.getJSONObject("payload").getJSONObject("records").getJSONArray("weights")
    val old = rows.getJSONObject(0)
    local.getJSONObject("clocks").getJSONObject("weight:" + old.getString("id")).put("updatedAt", 999)
    remote.getJSONObject("payload").getJSONObject("records").getJSONArray("weights").put(JSONObject(old.toString()).put("id", "new-same-day").put("weightKg", 79))
    remote.getJSONObject("clocks").put("weight:new-same-day", JSONObject().put("updatedAt", 1).put("deviceId", "device-a").put("id", "new-clock"))
    val merged = CompanionVaultMerge.merge(local, remote).getJSONObject("payload").getJSONObject("records").getJSONArray("weights")
    assertEquals(1, merged.length()); assertEquals("new-same-day", merged.getJSONObject(0).getString("id"))
  }
  @Test fun unrelatedExportDoesNotAdvancePreferencesClockOrRetainPhotoBytesInMetadata() {
    val case = fixture().getJSONArray("cases").getJSONObject(0)
    val payload = case.getJSONObject("local").getJSONObject("payload")
    val first = CompanionVaultMerge.prepare(payload, null, "device-a", 1000)
    val prior = CompanionVaultMerge.metadata(first)
    payload.getJSONObject("records").getJSONArray("weights").getJSONObject(0).put("weightKg", 81)
    val next = CompanionVaultMerge.prepare(payload, prior, "device-a", 900)
    assertEquals(CompanionVaultMerge.canonical(first.getJSONObject("clocks").getJSONObject("preferences")),
      CompanionVaultMerge.canonical(next.getJSONObject("clocks").getJSONObject("preferences")))
    assertTrue(next.getJSONObject("clocks").getJSONObject("weight:wa").getLong("updatedAt") > first.getJSONObject("clocks").getJSONObject("weight:wa").getLong("updatedAt"))
    assertFalse(prior.has("payload")); assertFalse(prior.has("photos"))
  }
}
