package com.zzzode.leanon.personal

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.IOException
import javax.crypto.spec.SecretKeySpec

class PersonalRepositoryTest {
  @get:Rule val temporary = TemporaryFolder()
  private val key = SecretKeySpec(ByteArray(32) { it.toByte() }, "AES")
  private fun repository(fail: Boolean = false) = PersonalRepository(EncryptedDocumentFile(temporary.root.resolve("state.enc"), "personal", { key }, persist = { file, value ->
    if (fail) throw IOException("Synthetic disk failure")
    com.zzzode.leanon.data.writeRecordsAtomically(file, value)
  }))
  private fun measurement(id: String = "measure-1", waist: Double = 82.5) = JSONObject().put("type", "save-measurement").put("measurement", JSONObject().put("id", id).put("date", "2026-10-06").put("waistCm", waist))
  private fun photo() = JSONObject().put("type", "add-photo").put("photo", JSONObject().put("id", "photo-1").put("date", "2026-10-06").put("view", "front").put("createdAt", "2026-10-06T12:00:00Z").put("mime", "image/jpeg").put("width", 8).put("height", 8))
  @Test fun emptyReadAndDurableMeasurementReopen() {
    val store = repository(); assertEquals(0, store.snapshot().getInt("revision")); assertFalse(temporary.root.resolve("state.enc").exists())
    store.mutate("save-1", 0, measurement())
    assertEquals(82.5, repository().snapshot().getJSONArray("measurements").getJSONObject(0).getDouble("waistCm"), 0.0)
    assertFalse(temporary.root.resolve("state.enc").readText().contains("waistCm"))
  }
  @Test fun replayBeforeCasReturnsCurrentSnapshotAndSemanticKeyOrder() {
    val store = repository(); store.mutate("save-1", 0, measurement()); store.mutate("save-2", 1, measurement(waist = 83.0))
    val replay = store.mutate("save-1", 0, JSONObject("{\"measurement\":{\"waistCm\":82.5,\"date\":\"2026-10-06\",\"id\":\"measure-1\"},\"type\":\"save-measurement\"}"))
    assertTrue(replay.getBoolean("replayed")); assertEquals(1, replay.getInt("appliedRevision")); assertEquals(2, replay.getJSONObject("personal").getInt("revision"))
    assertEquals(83.0, replay.getJSONObject("personal").getJSONArray("measurements").getJSONObject(0).getDouble("waistCm"), 0.0)
  }
  @Test fun staleChangedIdentityAndFailedPersistLeaveBytesUnchanged() {
    val store = repository(); store.mutate("save-1", 0, measurement()); val before = temporary.root.resolve("state.enc").readBytes()
    assertEquals("conflict", assertThrows(PersonalFailure::class.java) { store.mutate("save-1", 1, measurement(waist = 84.0)) }.code)
    assertEquals("conflict", assertThrows(PersonalFailure::class.java) { store.mutate("stale", 0, measurement()) }.code)
    assertThrows(IOException::class.java) { repository(true).mutate("save-2", 1, measurement(waist = 84.0)) }
    assertArrayEquals(before, temporary.root.resolve("state.enc").readBytes())
  }
  @Test fun photoMetadataAndEncryptedBytesAddReadDeleteTogether() {
    val store = repository(); val bytes = java.util.Base64.getDecoder().decode("/9j/4AAQSkZJRgABAQAASABIAAD/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9sAQwACAgICAgIDAgIDBQMDAwUGBQUFBQYIBgYGBgYICggICAgICAoKCgoKCgoKDAwMDAwMDg4ODg4PDw8PDw8PDw8P/9sAQwECAgIEBAQHBAQHEAsJCxAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ/90ABAAB/9oADAMBAAIRAxEAPwD5rooor+yD+bz/2Q==")
    assertThrows(PersonalFailure::class.java) { store.mutate("add-1", 0, photo()) }
    store.mutate("add-1", 0, photo(), bytes); assertArrayEquals(bytes, repository().photo("photo-1").second)
    store.mutate("delete-1", 1, JSONObject().put("type", "delete-photo").put("id", "photo-1"))
    assertEquals(0, repository().snapshot().getJSONArray("photos").length())
    assertThrows(PersonalFailure::class.java) { repository().photo("photo-1") }
  }
  @Test fun unknownPreferenceMetadataSurvivesButCredentialsRejected() {
    val store = repository(); val prefs = JSONObject("{\"pattern\":\"vegan\",\"excludedFoodIds\":[\"food-1\"],\"notes\":\"fixture\",\"future\":{\"value\":true}}")
    store.mutate("prefs-1", 0, JSONObject().put("type", "set-dietary-preferences").put("preferences", prefs))
    assertTrue(repository().snapshot().getJSONObject("dietaryPreferences").getJSONObject("future").getBoolean("value"))
    prefs.put("session_token", "never-save")
    assertThrows(PersonalFailure::class.java) { store.mutate("prefs-2", 1, JSONObject().put("type", "set-dietary-preferences").put("preferences", prefs)) }
  }
  @Test fun corruptSchemaAndUnsupportedVersionFailClosed() {
    val file = temporary.root.resolve("state.enc")
    EncryptedDocumentFile(file, "personal", { key }).write("{\"version\":2}".toByteArray()); val before = file.readBytes()
    assertThrows(IOException::class.java) { repository().snapshot() }; assertThrows(IOException::class.java) { repository().mutate("save", 0, measurement()) }
    assertArrayEquals(before, file.readBytes())
  }
}
