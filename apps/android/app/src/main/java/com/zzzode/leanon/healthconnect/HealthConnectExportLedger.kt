package com.zzzode.leanon.healthconnect

import com.zzzode.leanon.data.writeRecordsAtomically
import org.json.JSONObject
import java.io.File
import java.io.IOException

data class ExportVersionRequest(val clientRecordId: String, val fingerprint: String)

/** Persist revisions before insertion so retries after partial export reuse them. */
class HealthConnectExportLedger internal constructor(
  private val file: File,
  private val persist: (File, String) -> Unit = ::writeRecordsAtomically,
) {
  private var readStored: (File) -> String = { it.readText(Charsets.UTF_8) }
  constructor(context: android.content.Context) : this(context,
    com.zzzode.leanon.personal.EncryptedLegacyJsonCodec(context, "health-connect-ledger", File(context.filesDir, "health-connect-export-versions.json")))
  private constructor(context: android.content.Context, codec: com.zzzode.leanon.personal.EncryptedLegacyJsonCodec) : this(
    File(context.filesDir, "health-connect-export-versions.json"),
    { file, text -> writeRecordsAtomically(file, codec.encode(text)) },
  ) { readStored = codec::read }
  internal constructor(file: File, codec: com.zzzode.leanon.personal.EncryptedLegacyJsonCodec) : this(
    file, { target, text -> writeRecordsAtomically(target, codec.encode(text)) },
  ) { readStored = codec::read }
  private data class Entry(val fingerprint: String, val revision: Long)

  @Synchronized
  fun reserve(requests: List<ExportVersionRequest>): Map<String, Long> {
    val entries = read()
    val requested = LinkedHashMap<String, String>()
    for (request in requests) {
      require(request.clientRecordId.isNotBlank() && request.fingerprint.isNotBlank())
      val duplicate = requested.put(request.clientRecordId, request.fingerprint)
      require(duplicate == null || duplicate == request.fingerprint) { "Conflicting export records" }
    }
    var changed = false
    val result = LinkedHashMap<String, Long>()
    for ((id, fingerprint) in requested) {
      val previous = entries[id]
      val revision = when {
        previous == null -> 2L // Legacy exports used version 1 for every edit.
        previous.fingerprint == fingerprint -> previous.revision
        previous.revision == Long.MAX_VALUE -> throw IOException("Export revision exhausted")
        else -> previous.revision + 1L
      }
      if (previous == null || previous.fingerprint != fingerprint) {
        entries[id] = Entry(fingerprint, revision); changed = true
      }
      result[id] = revision
    }
    if (changed) {
      val json = JSONObject()
      for ((id, entry) in entries.toSortedMap()) {
        json.put(id, JSONObject().put("fingerprint", entry.fingerprint).put("revision", entry.revision))
      }
      persist(file, JSONObject().put("schema", 1).put("entries", json).toString())
    }
    return result
  }

  private fun read(): MutableMap<String, Entry> {
    if (!file.exists()) return LinkedHashMap()
    try {
      val root = JSONObject(readStored(file))
      if (root.get("schema") != 1) throw IOException("Unknown export ledger schema")
      val json = root.getJSONObject("entries")
      val entries = LinkedHashMap<String, Entry>()
      for (id in json.keys()) {
        val value = json.getJSONObject(id)
        val fingerprint = value.get("fingerprint") as? String
        val rawRevision = value.get("revision")
        if (id.isBlank() || fingerprint.isNullOrBlank() ||
          (rawRevision !is Int && rawRevision !is Long) || (rawRevision as Number).toLong() < 2L) {
          throw IOException("Invalid export ledger entry")
        }
        entries[id] = Entry(fingerprint, rawRevision.toLong())
      }
      return entries
    } catch (error: Exception) {
      throw IOException("Could not read export revisions; existing file preserved", error)
    }
  }
}
