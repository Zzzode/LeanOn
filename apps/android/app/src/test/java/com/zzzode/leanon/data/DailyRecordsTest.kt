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
import java.io.IOException

class DailyRecordsTest {
  @get:Rule val folder = TemporaryFolder()
  private val now = Clock.fixed(Instant.parse("2026-10-06T12:00:00Z"), ZoneOffset.UTC)
  private fun file() = folder.root.resolve("records.json")
  private fun store(persist: (java.io.File, String) -> Unit = ::writeRecordsAtomically): RecordsRepository {
    if (!file().exists()) file().writeText(emptyDailyRecords().toString())
    return RecordsRepository(file(), { emptyDailyRecords().toString() }, persist) { now }
  }
  private fun weight(date: String = "2026-10-05", kg: Double = 80.0) = JSONObject().put("type", "set-weight").put("date", date).put("weightKg", kg)
  private fun apply(id: String, mutation: JSONObject, revision: Long = store().loadHostData().getLong("revision")) = store().mutate(id, revision, mutation)
  private fun entry(id: String = "meal-1") = JSONObject().put("id", id).put("date", "2026-10-05").put("meal", "lunch").put("name", "Oats").put("grams", 40).put("kcal", 150)
    .put("macros", JSONObject().put("proteinG", 5).put("carbsG", 25).put("fatG", 3))
    .put("micros", JSONObject().put("fiberG", 4).put("sugarG", 1).put("saturatedFatG", 1).put("sodiumMg", 20))
  private fun profile(mode: String = "tracking-only", birth: String = "1990-01-01") = JSONObject().put("type", "save-profile")
    .put("profile", JSONObject().put("sex", "female").put("birthDate", birth).put("heightCm", 170).put("activityLevel", "lightly_active"))
    .put("goalWeightKg", if (mode == "weight-loss") 70 else JSONObject.NULL).put("weeklyLossKg", if (mode == "weight-loss") 0.5 else JSONObject.NULL)
    .put("guidanceMode", mode).put("safetyFlags", JSONObject().put("pregnant", false).put("breastfeeding", false).put("eatingDisorderRisk", false))

  @Test fun emptyFirstLaunchHasNoDemoAndNullableUnscreenedSetup() {
    val fresh = RecordsRepository(file(), { emptyDailyRecords().toString() }, clock = { now })
    val data = fresh.currentSnapshot()
    assertFalse(file().exists())
    assertEquals(2, data.getInt("schemaVersion")); assertEquals(0, data.getInt("revision")); assertTrue(data.isNull("profile")); assertFalse(data.getBoolean("setupCompleted"))
    assertTrue(data.getJSONObject("safetyFlags").isNull("pregnant"))
    for (key in listOf("weights", "water", "intake", "intakeEntries", "legacyIntake", "deletedRecords", "processedOperations")) assertEquals(0, data.getJSONArray(key).length())
  }
  @Test fun historicalWeightUpsertHasStableIdAndReopens() {
    apply("w1", weight()); apply("w2", weight(kg = 79.0))
    val data = store().loadHostData(); assertEquals(2, data.getInt("revision")); assertEquals(1, data.getJSONArray("weights").length())
    assertEquals("weight-2026-10-05", data.getJSONArray("weights").getJSONObject(0).getString("id"))
    assertEquals(79.0, data.getJSONArray("weights").getJSONObject(0).getDouble("weightKg"), 0.0)
  }
  @Test fun replayAfterRestartIgnoresStaleRevisionAndReturnsOriginalReceipt() {
    val first = apply("w1", weight()); apply("water1", JSONObject().put("type", "set-water").put("date", "2026-10-05").put("amountMl", 250))
    val bytes = file().readText(); val replay = store().mutate("w1", 0, weight())
    assertTrue(replay.getBoolean("replayed")); assertEquals(first.getLong("appliedRevision"), replay.getLong("appliedRevision")); assertEquals(2, replay.getJSONObject("hostData").getInt("revision")); assertEquals(bytes, file().readText())
  }
  @Test fun reusedOperationWithDifferentContentRejectsWithoutWrite() {
    apply("w1", weight()); val before = file().readText()
    val error = assertThrows(RecordsFailure::class.java) { apply("w1", weight(kg = 70.0), 0) }
    assertEquals("invalid-request", error.code); assertEquals(before, file().readText())
  }
  @Test fun staleRevisionRejectsWithoutWriting() {
    apply("w1", weight()); val before = file().readText()
    assertEquals("conflict", assertThrows(RecordsFailure::class.java) { apply("w2", weight(kg = 70.0), 0) }.code)
    assertEquals(before, file().readText())
  }
  @Test fun intakeDetailsEditAndDeleteProjectRatherThanDoubleCount() {
    apply("meal1", JSONObject().put("type", "save-intake").put("entry", entry()))
    apply("meal-edit", JSONObject().put("type", "save-intake").put("entry", entry().put("kcal", 200)))
    assertEquals(200.0, store().loadHostData().getJSONArray("intake").getJSONObject(0).getDouble("kcal"), 0.0)
    apply("meal-delete", JSONObject().put("type", "delete-record").put("kind", "intake").put("id", "meal-1"))
    assertEquals(0, store().loadHostData().getJSONArray("intake").length())
  }
  @Test fun legacyAggregateMigrationDoesNotInventMeals() {
    val legacy = JSONObject().put("weights", JSONArray()).put("intake", JSONArray().put(entry().apply { remove("id"); remove("name"); remove("meal"); remove("grams") }))
    file().writeText(legacy.toString()); val data = store().loadHostData()
    assertEquals(1, data.getJSONArray("legacyIntake").length()); assertEquals(0, data.getJSONArray("intakeEntries").length())
    apply("newmeal", JSONObject().put("type", "save-intake").put("entry", entry()))
    assertEquals(300.0, store().loadHostData().getJSONArray("intake").getJSONObject(0).getDouble("kcal"), 0.0)
  }
  @Test fun legacyIntakeWriteAndOtherNativeMutationsAdvanceSharedRevision() {
    store().addIntake("2026-10-05", 100.0, 1.0, 2.0, 3.0)
    apply("newmeal", JSONObject().put("type", "save-intake").put("entry", entry()))
    store().addIntake("2026-10-05", 50.0, 1.0, 2.0, 3.0)
    assertEquals(3, store().loadHostData().getInt("revision")); assertEquals(300.0, store().loadHostData().getJSONArray("intake").getJSONObject(0).getDouble("kcal"), 0.0)
  }
  @Test fun deleteReceiptAndUndoSurviveRestart() {
    apply("w1", weight()); val deleted = apply("del", JSONObject().put("type", "delete-record").put("kind", "weight").put("id", "weight-2026-10-05"))
    assertEquals("undo-del", deleted.getString("undoToken")); assertEquals(1, store().loadHostData().getJSONArray("deletedRecords").length())
    apply("restore", JSONObject().put("type", "restore-record").put("token", "undo-del"))
    assertEquals(1, store().loadHostData().getJSONArray("weights").length()); assertEquals(0, store().loadHostData().getJSONArray("deletedRecords").length())
    assertTrue(store().mutate("del", 0, JSONObject().put("type", "delete-record").put("kind", "weight").put("id", "weight-2026-10-05")).getBoolean("replayed"))
  }
  @Test fun restoreConflictNeverOverwritesNewRecordAndKeepsTrash() {
    apply("w1", weight()); apply("del", JSONObject().put("type", "delete-record").put("kind", "weight").put("id", "weight-2026-10-05")); apply("w2", weight(kg = 70.0))
    val before = file().readText()
    assertEquals("conflict", assertThrows(RecordsFailure::class.java) { apply("restore", JSONObject().put("type", "restore-record").put("token", "undo-del")) }.code)
    assertEquals(before, file().readText())
  }
  @Test fun externalRecordsCannotBeEditedOrDeleted() {
    val data = store().loadHostData(); data.getJSONArray("weights").put(JSONObject().put("id", "weight-2026-10-05").put("date", "2026-10-05").put("weightKg", 80).put("source", "health_connect")); file().writeText(data.toString())
    assertEquals("not-authorized", assertThrows(RecordsFailure::class.java) { apply("edit", weight().put("id", "weight-2026-10-05")) }.code)
    assertEquals("not-authorized", assertThrows(RecordsFailure::class.java) { apply("delete", JSONObject().put("type", "delete-record").put("kind", "weight").put("id", "weight-2026-10-05")) }.code)
  }
  @Test fun invalidFutureAndImpossibleDatesDoNotWrite() {
    store().loadHostData(); val before = file().readText()
    for (date in listOf("2026-10-07", "2026-02-30")) assertThrows(RecordsFailure::class.java) { apply("bad-$date", weight(date)) }
    assertEquals(before, file().readText())
  }
  @Test fun failedDurableWriteDoesNotLeaveReceiptOrRecord() {
    store().loadHostData(); val before = file().readText()
    assertThrows(IOException::class.java) { store { _, _ -> throw IOException("Disk full") }.mutate("w", 0, weight()) }
    assertEquals(before, file().readText()); assertEquals(0, store().loadHostData().getJSONArray("processedOperations").length())
  }
  @Test fun corruptAndFutureSchemaFilesRemainUntouched() {
    for (text in listOf("{}", "{broken", emptyDailyRecords().put("schemaVersion", 99).toString())) {
      file().writeText(text); assertThrows(Exception::class.java) { store().loadHostData() }; assertEquals(text, file().readText())
    }
  }
  @Test fun trackingSetupAndEditPersistWithoutInventingWeight() {
    apply("setup", profile()); assertTrue(store().loadHostData().getBoolean("setupCompleted")); assertTrue(store().loadHostData().isNull("goalWeightKg")); assertEquals(0, store().loadHostData().getJSONArray("weights").length())
    assertThrows(RecordsFailure::class.java) { apply("edit", profile().put("initialWeightKg", 80)) }
  }
  @Test fun safeWeightLossSetupRequiresAdultScreensWeightAndHealthyBmi() {
    apply("setup", profile("weight-loss").put("initialWeightKg", 80))
    assertEquals("weight-loss", store().loadHostData().getString("guidanceMode")); assertEquals(1, store().loadHostData().getJSONArray("weights").length())
    for (mutation in listOf(profile("weight-loss", "2008-01-01"), profile("weight-loss").put("safetyFlags", JSONObject().put("pregnant", JSONObject.NULL).put("breastfeeding", false).put("eatingDisorderRisk", false)), profile("weight-loss").put("goalWeightKg", 40))) assertThrows(RecordsFailure::class.java) { apply("bad-${mutation}", mutation) }
  }
  @Test fun snapshotsFollowRuntimeTimezoneAndMidnightWithoutChangingDraftDateOrFile() {
    apply("w", weight()); val bytes = file().readText()
    val later = RecordsRepository(file(), { error("No reseed") }, clock = { Clock.fixed(Instant.parse("2026-10-06T23:59:00Z"), ZoneOffset.ofHours(2)) }).currentSnapshot()
    assertEquals("2026-10-07", later.getString("today")); assertEquals("2026-10-05", later.getJSONArray("weights").getJSONObject(0).getString("date")); assertEquals(bytes, file().readText())
  }
  @Test fun movedDailyIdDoesNotCollideWithLaterLegacyWritesAndImports() {
    apply("first", weight("2026-10-04"))
    apply("move", weight("2026-10-05").put("id", "weight-2026-10-04"))
    store().addWeight("2026-10-04", 81.0)
    store().replaceExternalWeights(mapOf("2026-10-03" to 79.0))
    val rows = store().loadHostData().getJSONArray("weights")
    assertEquals(3, rows.length()); assertEquals(3, (0 until rows.length()).map { rows.getJSONObject(it).getString("id") }.toSet().size)
  }
  @Test fun firstSetupInitialWeightPreservesPreloggedMovedId() {
    apply("first", weight("2026-10-05"))
    apply("move", weight("2026-10-06").put("id", "weight-2026-10-05"))
    apply("setup", profile().put("initialWeightKg", 82))
    val row = store().loadHostData().getJSONArray("weights").getJSONObject(0)
    assertEquals("weight-2026-10-05", row.getString("id")); assertEquals(82.0, row.getDouble("weightKg"), 0.0)
  }
  @Test fun deletedEntryCannotBeSilentlyRecreatedInsteadOfRestored() {
    apply("entry", JSONObject().put("type", "save-intake").put("entry", entry()))
    apply("del", JSONObject().put("type", "delete-record").put("kind", "intake").put("id", "meal-1"))
    val before = file().readText()
    assertEquals("conflict", assertThrows(RecordsFailure::class.java) { apply("recreate", JSONObject().put("type", "save-intake").put("entry", entry())) }.code)
    assertEquals(before, file().readText())
    apply("restore", JSONObject().put("type", "restore-record").put("token", "undo-del"))
    assertEquals(1, store().loadHostData().getJSONArray("intakeEntries").length())
  }
  @Test fun legacyReadAndRejectedMutationNeverCommitMigration() {
    val legacy = JSONObject().put("weights", JSONArray()).put("intake", JSONArray()).toString()
    file().writeText(legacy)
    assertEquals(2, store().loadHostData().getInt("schemaVersion")); assertEquals(legacy, file().readText())
    assertThrows(RecordsFailure::class.java) { apply("stale", weight(), 99) }
    assertEquals(legacy, file().readText())
    assertThrows(IOException::class.java) { store { _, _ -> throw IOException("Disk full") }.mutate("w", 0, weight()) }
    assertEquals(legacy, file().readText())
    apply("good", weight()); assertEquals(2, JSONObject(file().readText()).getInt("schemaVersion"))
  }
  @Test fun legacyDuplicateAggregatesRetainMetadataAndRestoreByIdentity() {
    val row = entry().apply { remove("id"); remove("meal"); remove("name"); remove("grams"); put("unknown", "preserve") }
    file().writeText(JSONObject().put("weights", JSONArray()).put("intake", JSONArray().put(row).put(JSONObject(row.toString()).put("kcal", 200))).toString())
    val projected = store().loadHostData(); val rows = projected.getJSONArray("legacyIntake")
    assertEquals(2, rows.length()); assertEquals(350.0, projected.getJSONArray("intake").getJSONObject(0).getDouble("kcal"), 0.0)
    val id = rows.getJSONObject(0).getString("id")
    apply("del", JSONObject().put("type", "delete-record").put("kind", "legacy-intake").put("id", id))
    apply("undo", JSONObject().put("type", "restore-record").put("token", "undo-del"))
    assertEquals(2, store().loadHostData().getJSONArray("legacyIntake").length())
    assertEquals("preserve", store().loadHostData().getJSONArray("legacyIntake").getJSONObject(1).getString("unknown"))
  }
  @Test fun malformedMetadataAndExhaustedRevisionPreserveOriginalFile() {
    for (data in listOf(emptyDailyRecords().put("processedOperations", JSONArray().put(JSONObject().put("operationId", "bad"))), emptyDailyRecords().put("deletedRecords", JSONArray().put(JSONObject().put("token", "bad"))))) {
      file().writeText(data.toString()); val before = file().readText(); assertThrows(Exception::class.java) { store().loadHostData() }; assertEquals(before, file().readText())
    }
    file().writeText(emptyDailyRecords().put("revision", 9007199254740991L).toString()); val before = file().readText()
    assertThrows(RecordsFailure::class.java) { store().addWeight("2026-10-05", 80.0) }; assertEquals(before, file().readText())
  }
  @Test fun invalidLegacyProfileAndGoalsFailClosedWithoutResettingHistory() {
    for (bad in listOf(JSONObject().put("profile", JSONObject().put("heightCm", 170)), JSONObject().put("goalWeightKg", "70"))) {
      bad.put("weights", JSONArray()).put("intake", JSONArray()); file().writeText(bad.toString()); val before = file().readText()
      assertThrows(IOException::class.java) { store().loadHostData() }; assertEquals(before, file().readText())
    }
  }
  @Test fun allLegacyUserWritesRejectFutureDatesWithoutChangingTheFile() {
    store().loadHostData(); val before = file().readText()
    assertThrows(RecordsFailure::class.java) { store().addWeight("2026-10-07", 80.0) }
    assertThrows(RecordsFailure::class.java) { store().upsertWater("2026-10-07", 100.0) }
    assertThrows(RecordsFailure::class.java) { store().addExercise("2026-10-07", "walking", 10.0, 30.0) }
    assertEquals(before, file().readText())
  }

  @Test fun weightLossSetupWithoutMeasuredWeightRejectsAndTrackingStillWorks() {
    val before = store().loadHostData().toString()
    assertEquals("invalid-request", assertThrows(RecordsFailure::class.java) { apply("unsafe", profile("weight-loss")) }.code)
    assertEquals(before, store().loadHostData().toString())
    apply("tracking", profile()); assertEquals(0, store().loadHostData().getJSONArray("weights").length())
  }
  @Test fun semanticStructuralErrorsPrecedeStaleRevisionAndNumericBooleansReject() {
    apply("good", weight())
    assertEquals("invalid-request", assertThrows(RecordsFailure::class.java) { apply("bad", weight().put("weightKg", true), 0) }.code)
    assertEquals("invalid-request", assertThrows(RecordsFailure::class.java) { apply(" spaced ", weight()) }.code)
  }

  @Test fun missingDeleteReceiptFailsClosedOnReopen() {
    apply("weight", weight())
    apply("delete", JSONObject().put("type", "delete-record").put("kind", "weight").put("id", "weight-2026-10-05"))
    val data = JSONObject(file().readText()); data.getJSONArray("processedOperations").remove(1)
    file().writeText(data.toString()); val before = file().readBytes()
    assertThrows(IOException::class.java) { store().currentSnapshot() }
    assertArrayEquals(before, file().readBytes())
  }
  @Test fun deletionReceiptRequiresUndoTokenAfterRestore() {
    apply("weight", weight())
    apply("delete", JSONObject().put("type", "delete-record").put("kind", "weight").put("id", "weight-2026-10-05"))
    apply("restore", JSONObject().put("type", "restore-record").put("token", "undo-delete"))
    val data = JSONObject(file().readText()); data.getJSONArray("processedOperations").getJSONObject(1).remove("undoToken")
    file().writeText(data.toString()); val before = file().readBytes()
    assertThrows(IOException::class.java) { store().currentSnapshot() }
    assertArrayEquals(before, file().readBytes())
  }

  @Test fun nonDeleteReceiptRejectsUndoTokenWithoutChangingBytes() {
    apply("weight", weight())
    val data = JSONObject(file().readText()); data.getJSONArray("processedOperations").getJSONObject(0).put("undoToken", "undo-weight")
    file().writeText(data.toString()); val before = file().readBytes()
    assertThrows(IOException::class.java) { store().currentSnapshot() }
    assertArrayEquals(before, file().readBytes())
  }

}
