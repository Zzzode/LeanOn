package com.zzzode.leanon.personal

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException

/** Personal metadata and scrubbed photo bytes commit together in one encrypted collection. */
internal class PersonalRepository(private val document: EncryptedDocumentFile) {
  constructor(context: Context) : this(kotlin.run {
    val directory = File(context.filesDir, "personal-v1")
    val keys = PersonalKeyStore(context, directory, "personal")
    EncryptedDocumentFile(File(directory, "state.enc"), "personal", keys::key, eraseKey = keys::delete)
  })
  internal fun eraseStorageKeys() = document.eraseKey()
  internal var availabilityCheck: () -> Unit = {}
  internal val storageFile: File get() = document.file
  @Synchronized internal fun prepareCollection(value: JSONObject): ByteArray { validateCollection(value); return document.prepare(value.toString().toByteArray()) }
  private fun empty() = JSONObject().put("version", 1).put("personal", emptyPersonal()).put("photoBytes", JSONObject())
  @Synchronized internal fun loadCollection(): JSONObject {
    availabilityCheck()
    val bytes = document.readOrNull() ?: return empty()
    try {
      val value = strictJsonObject(String(bytes, Charsets.UTF_8)); validateCollection(value); return value
    } catch (error: Exception) { throw IOException("Saved personal data is unavailable", error) }
    finally { bytes.fill(0) }
  }
  internal fun validateCollection(value: JSONObject) {
    personalKeys(value, listOf("version", "personal", "photoBytes"))
    if (value.opt("version") !is Number || value.getDouble("version") != 1.0) personalInvalid("Invalid encrypted collection version")
    val personal = value.optJSONObject("personal") ?: personalInvalid("Missing personal data"); validatePersonalState(personal)
    val photos = personal.getJSONArray("photos"); val blobs = value.optJSONObject("photoBytes") ?: personalInvalid("Missing photo bytes")
    if (blobs.length() != photos.length()) personalInvalid("Photo metadata and bytes disagree")
    var totalBytes = 0L
    for (i in 0 until photos.length()) {
      val metadata = photos.getJSONObject(i); if (metadata.opt("mime") != "image/jpeg") personalInvalid("Persisted photos must be sanitized JPEG")
      val id = metadata.getString("id"); val bytes = PersonalCrypto.decode(blobs.opt(id), maximum = 20 * 1024 * 1024)
      try { if (bytes.isEmpty() || bytes.size > 20 * 1024 * 1024) personalInvalid("Invalid photo size"); validateSanitizedJpeg(bytes, metadata.getInt("width"), metadata.getInt("height")); totalBytes += bytes.size; if (totalBytes > 32L * 1024 * 1024) personalInvalid("Photo collection is too large") } finally { bytes.fill(0) }
    }
  }
  @Synchronized fun snapshot(): JSONObject = loadCollection().getJSONObject("personal")
  @Synchronized fun photo(id: String): Pair<JSONObject, ByteArray> {
    personalId(id)
    val collection = loadCollection(); val personal = collection.getJSONObject("personal"); val photos = personal.getJSONArray("photos")
    val metadata = (0 until photos.length()).map { photos.getJSONObject(it) }.firstOrNull { it.getString("id") == id }
      ?: throw PersonalFailure("not-found", "Photo no longer exists")
    return metadata to PersonalCrypto.decode(collection.getJSONObject("photoBytes").opt(id), maximum = 20 * 1024 * 1024)
  }
  @Synchronized fun mutate(operationId: String, expectedRevision: Long, mutation: JSONObject, photoBytes: ByteArray? = null): JSONObject {
    personalId(operationId); personalRevision(expectedRevision); validatePersonalMutation(mutation)
    val collection = loadCollection(); val state = collection.getJSONObject("personal"); val receipts = state.getJSONArray("processedOperations")
    for (i in 0 until receipts.length()) {
      val receipt = receipts.getJSONObject(i)
      if (receipt.getString("operationId") != operationId) continue
      if (personalCanonical(receipt.getJSONObject("mutation")) != personalCanonical(mutation)) throw PersonalFailure("conflict", "Operation identity was reused")
      return JSONObject().put("personal", state).put("appliedRevision", receipt.getLong("appliedRevision")).put("replayed", true)
    }
    val revision = state.getLong("revision")
    if (revision != expectedRevision) throw PersonalFailure("conflict", "Personal revision changed")
    if (revision == MAX_PERSONAL_REVISION) personalInvalid("Revision limit reached")
    val copiedMutation = JSONObject(mutation.toString())
    when (mutation.getString("type")) {
      "set-dietary-preferences" -> {
        val preferences = state.getJSONObject("dietaryPreferences"); val updated = mutation.getJSONObject("preferences")
        for (key in updated.keys()) preferences.put(key, updated.get(key))
      }
      "save-measurement" -> {
        val rows = state.getJSONArray("measurements"); val row = copiedMutation.getJSONObject("measurement")
        val index = (0 until rows.length()).firstOrNull { rows.getJSONObject(it).getString("id") == row.getString("id") }
        if (index == null) rows.put(row) else rows.put(index, row)
        val sorted = (0 until rows.length()).map { rows.getJSONObject(it) }.sortedWith(compareBy({ it.getString("date") }, { it.getString("id") }))
        state.put("measurements", JSONArray(sorted))
      }
      "add-photo" -> {
        val row = copiedMutation.getJSONObject("photo"); val rows = state.getJSONArray("photos"); val id = row.getString("id")
        if ((0 until rows.length()).any { rows.getJSONObject(it).getString("id") == id }) throw PersonalFailure("conflict", "Photo identity already exists")
        if (photoBytes == null || photoBytes.isEmpty()) personalInvalid("Photo bytes must come from an explicit image selection")
        rows.put(row); collection.getJSONObject("photoBytes").put(id, PersonalCrypto.encode(photoBytes))
      }
      "update-photo" -> {
        val row = copiedMutation.getJSONObject("photo"); val rows = state.getJSONArray("photos")
        val index = (0 until rows.length()).firstOrNull { rows.getJSONObject(it).getString("id") == row.getString("id") } ?: throw PersonalFailure("conflict", "Photo no longer exists")
        val existing = rows.getJSONObject(index)
        for (field in listOf("createdAt", "mime", "width", "height")) if (personalCanonical(existing.opt(field)) != personalCanonical(row.opt(field))) personalInvalid("Photo image metadata is immutable")
        rows.put(index, row)
      }
      "delete-photo", "delete-measurement" -> {
        val photo = mutation.getString("type") == "delete-photo"; val rows = state.getJSONArray(if (photo) "photos" else "measurements"); val id = mutation.getString("id")
        val index = (0 until rows.length()).firstOrNull { rows.getJSONObject(it).getString("id") == id } ?: throw PersonalFailure("conflict", "Record no longer exists")
        rows.remove(index); if (photo) collection.getJSONObject("photoBytes").remove(id)
      }
    }
    state.put("revision", revision + 1)
    receipts.put(JSONObject().put("operationId", operationId).put("mutation", copiedMutation).put("appliedRevision", revision + 1))
    validateCollection(collection)
    val bytes = collection.toString().toByteArray()
    try { document.write(bytes) } finally { bytes.fill(0) }
    return JSONObject().put("personal", state).put("appliedRevision", revision + 1).put("replayed", false)
  }
}
