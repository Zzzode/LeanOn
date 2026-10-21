package com.zzzode.leanon.data

import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.io.File

/** Runs the shared worked example against actual atomic repository transactions. */
class DailyRecordsConformanceTest {
  @get:Rule val temporary = TemporaryFolder()
  @Test fun sharedConformanceSnapshotsAndFailureCodes() {
    val fixture = JSONObject(javaClass.getResourceAsStream("/records-conformance.json")!!.bufferedReader().use { it.readText() })
    val records = temporary.root.resolve("records.json")
    val clock = Clock.fixed(Instant.parse(fixture.getJSONObject("clock").getString("deletedAt")), ZoneOffset.UTC)
    fun store() = RecordsRepository(records, { emptyDailyRecords().toString() }, clock = { clock })
    val results = JSONArray(); val failures = JSONArray()
    for (i in 0 until fixture.getJSONArray("operations").length()) {
      val scenario = fixture.getJSONArray("operations").getJSONObject(i)
      val request = scenario.getJSONObject("request")
      val response = store().mutate(request.getString("operationId"), request.getLong("expectedRevision"), request.getJSONObject("mutation"))
      checkExpected(scenario.getJSONObject("expect"), response, response.getJSONObject("hostData"))
      results.put(JSONObject().put("request", request).put("response", response))
    }
    for (i in 0 until fixture.getJSONArray("rejections").length()) {
      val scenario = fixture.getJSONArray("rejections").getJSONObject(i); val request = scenario.getJSONObject("request")
      val before = records.readText()
      val error = assertThrows(RecordsFailure::class.java) { store().mutate(request.getString("operationId"), request.getLong("expectedRevision"), request.getJSONObject("mutation")) }
      assertEquals(scenario.getJSONObject("expect").getString("code"), error.code); assertEquals(before, records.readText())
      val snapshot = store().currentSnapshot(); checkExpected(scenario.getJSONObject("expect"), JSONObject(), snapshot)
      failures.put(JSONObject().put("request", request).put("code", error.code).put("hostData", snapshot))
    }
    val report = JSONObject().put("platform", "android").put("kind", "native-repository-worked-conformance-not-ui")
      .put("success", true).put("operations", results).put("rejections", failures).put("finalHostData", store().currentSnapshot())
    System.getenv("LEANON_ANDROID_CONFORMANCE_OUTPUT")?.takeIf { it.isNotBlank() }?.let {
      File(it).writeText(report.toString(2))
    }
  }

  private fun checkExpected(expect: JSONObject, result: JSONObject, host: JSONObject) {
    for (key in expect.keys()) when (key) {
      "code" -> Unit
      "revision", "setupCompleted" -> assertEquals(expect.get(key), host.get(key))
      "replayed", "appliedRevision", "undoToken" -> assertEquals(expect.get(key).toString(), result.get(key).toString())
      "entries" -> assertEquals(expect.getInt(key), host.getJSONArray("intakeEntries").length())
      "deletedRecords", "weights" -> assertEquals(expect.getInt(key), host.getJSONArray(key).length())
      "kcal", "proteinG", "fiberG", "sodiumMg" -> {
        val intake = host.getJSONArray("intake").getJSONObject(0)
        val actual = when (key) { "proteinG" -> intake.getJSONObject("macros").getDouble(key); "fiberG", "sodiumMg" -> intake.getJSONObject("micros").getDouble(key); else -> intake.getDouble(key) }
        assertEquals(expect.getDouble(key), actual, 0.000001)
      }
      "weightDate", "weightKg", "stableWeightId" -> {
        val record = host.getJSONArray("weights").getJSONObject(0)
        val actual = when (key) { "weightDate" -> record.get("date"); "stableWeightId" -> record.get("id"); else -> record.get("weightKg") }
        assertEquals(expect.get(key).toString(), actual.toString().removeSuffix(".0"))
      }
      "newWeightId" -> assertTrue((0 until host.getJSONArray("weights").length()).any { host.getJSONArray("weights").getJSONObject(it).getString("id") == expect.getString(key) })
      "waterDate", "waterMl" -> {
        val record = host.getJSONArray("water").getJSONObject(0)
        if (key == "waterDate") assertEquals(expect.getString(key), record.getString("date")) else assertEquals(expect.getDouble(key), record.getDouble("amountMl"), 0.0)
      }
      "intakeDate" -> assertEquals(expect.getString(key), host.getJSONArray("intake").getJSONObject(0).getString("date"))
      else -> fail("Unhandled worked expectation $key")
    }
  }
}
