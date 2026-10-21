package com.zzzode.leanon.data

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.Clock
import java.time.Instant
import java.time.ZoneId

class CurrentSnapshotTest {
  @get:Rule val temporary = TemporaryFolder()
  private fun clock(instant: String, zone: String = "UTC") = Clock.fixed(Instant.parse(instant), ZoneId.of(zone))
  private fun host() = JSONObject("""{"today":"2026-10-01","todayHour":19,"streak":99,"weights":[],"intake":[],"exercises":[],"water":[]}""")

  @Test fun dateAndHourFollowTheLocalTimezoneWithoutChangingStoredMetadata() {
    val data = host()
    val snapshot = currentSnapshot(data, clock("2026-10-06T23:30:00Z", "Asia/Shanghai"))
    assertEquals("2026-10-07", snapshot.getString("today"))
    assertEquals(7, snapshot.getInt("todayHour"))
    assertEquals(0, snapshot.getInt("streak"))
    assertEquals("2026-10-01", data.getString("today"))
    assertEquals(99, data.getInt("streak"))
  }

  @Test fun streakCombinesOwnAndMirroredRecordsAndRetainsYesterdayBeforeTodaysCheckIn() {
    val data = host()
      .put("weights", JSONArray("""[{"date":"2026-10-04","weightKg":80},{"date":"2026-10-05","weightKg":79,"source":"health_connect"}]"""))
      .put("intake", JSONArray("""[{"date":"2026-10-03","kcal":400},{"date":"2026-10-03","kcal":200}]"""))
      .put("exercises", JSONArray("""[{"date":"2026-10-02","durationMin":30,"source":"health_connect"}]"""))
      .put("water", JSONArray("""[{"date":"2026-10-01","amountMl":250},{"date":"2026-10-06","amountMl":0},{"date":"2026-10-07","amountMl":250}]"""))
    assertEquals(5, currentSnapshot(data, clock("2026-10-06T07:00:00Z")).getInt("streak"))
    data.getJSONArray("water").put(JSONObject().put("date", "2026-10-06").put("amountMl", 250))
    assertEquals(6, currentSnapshot(data, clock("2026-10-06T07:00:00Z")).getInt("streak"))
    assertEquals(0, currentSnapshot(data, clock("2026-10-09T07:00:00Z")).getInt("streak"))
  }

  @Test fun currentRepositorySnapshotsRollOverWithoutRewritingHealthRecords() {
    val file = temporary.root.resolve("records.json")
    var current = clock("2026-10-06T23:59:00Z")
    val store = RecordsRepository(file, { host().toString() }, clock = { current })
    store.upsertWater("2026-10-06", 250.0)
    val saved = file.readText()
    assertEquals("2026-10-06", store.currentSnapshot().getString("today"))
    current = clock("2026-10-07T00:01:00Z")
    assertEquals("2026-10-07", store.currentSnapshot().getString("today"))
    assertEquals(0, store.currentSnapshot().getInt("todayHour"))
    assertEquals(1, store.currentSnapshot().getInt("streak"))
    assertEquals(saved, file.readText())
    assertEquals("2026-10-01", store.loadHostData().getString("today"))
  }

  @Test fun malformedDatesAndZeroEntriesDoNotInventAStreak() {
    val data = host().put("water", JSONArray("""[{"date":"2026-02-30","amountMl":250},{"date":"2026-10-05","amountMl":0}]"""))
    assertEquals(0, currentSnapshot(data, clock("2026-10-06T07:00:00Z")).getInt("streak"))
  }
}
