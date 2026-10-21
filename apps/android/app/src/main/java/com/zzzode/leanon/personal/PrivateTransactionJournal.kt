package com.zzzode.leanon.personal

import com.zzzode.leanon.data.writeBytesAtomically
import com.zzzode.leanon.data.syncPrivateDirectory
import com.zzzode.leanon.data.AtomicDurabilityUncertain
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.UUID
import javax.crypto.SecretKey

/** Authenticated undo/redo journal; ciphertext pieces avoid nested base64 size amplification. */
internal class PrivateTransactionJournal(
  private val directory: File,
  private val key: (Boolean) -> SecretKey,
  private val allowedTarget: (File) -> Boolean,
  private val checkpoint: (String) -> Unit = {},
  private val persist: (File, ByteArray) -> Unit = ::writeBytesAtomically,
) {
  private val manifest = EncryptedDocumentFile(File(directory, "transaction.enc"), "private-transaction", key, persist = { file, text -> persist(file, text.toByteArray(Charsets.UTF_8)) })
  @Volatile var available: Boolean = true
    private set
  fun requireAvailable() { if (!available) throw IOException("Private transaction recovery is required") }
  private fun ensureDirectory() { if (!directory.exists() && !directory.mkdirs()) throw IOException("Private transaction directory unavailable") }
  private fun part(name: String): File {
    if (!name.matches(Regex("[a-f0-9-]{36}-[0-9]+-(before|after)\\.piece"))) throw IOException("Invalid journal piece")
    return File(directory, name)
  }
  private fun writePiece(name: String, bytes: ByteArray) {
    if (bytes.size > 128 * 1024 * 1024) throw IOException("Transaction target exceeds supported size")
    val (nonce, sealed) = PersonalCrypto.encrypt(key(true), bytes, ("LeanOn journal v1:" + name).toByteArray())
    try { persist(part(name), byteArrayOf(76, 79, 74, 49) + nonce + sealed) } finally { sealed.fill(0) }
  }
  private fun readPiece(name: String): ByteArray {
    val file = part(name)
    if (!file.exists() || file.length() !in 32L..(128L * 1024 * 1024 + 32)) throw IOException("Transaction piece unavailable")
    val bytes = file.readBytes()
    try {
      if (!bytes.copyOfRange(0, 4).contentEquals(byteArrayOf(76, 79, 74, 49))) throw IOException("Invalid transaction piece")
      return PersonalCrypto.decrypt(key(false), bytes.copyOfRange(4, 16), bytes.copyOfRange(16, bytes.size), ("LeanOn journal v1:" + name).toByteArray())
    } finally { bytes.fill(0) }
  }
  private fun applyRows(rows: JSONArray, field: String) {
    // Authenticate every selected piece before changing any target.
    val replacements = (0 until rows.length()).map { index ->
      val row = rows.getJSONObject(index); val target = File(row.getString("target"))
      if (!allowedTarget(target)) throw IOException("Invalid private transaction target")
      target to if (row.isNull(field)) null else readPiece(row.getString(field))
    }
    try {
      for ((file, bytes) in replacements) {
        if (bytes == null) { if (file.exists()) { if (!file.delete()) throw IOException("Private target deletion failed"); syncPrivateDirectory(file.parentFile ?: throw IOException("Private directory unavailable")) } }
        else { file.parentFile?.mkdirs(); persist(file, bytes) }
      }
    } finally { replacements.forEach { it.second?.fill(0) } }
  }
  private fun cleanup() {
    // Remove the commit record first. Remaining pieces then become harmless orphans.
    if (manifest.file.exists() && !manifest.file.delete()) throw IOException("Transaction cleanup unavailable")
    if (directory.exists()) syncPrivateDirectory(directory)
    directory.listFiles()?.filter { it.name.endsWith(".piece") }?.forEach { it.delete() }
  }
  @Synchronized fun recover() {
    try {
      val bytes = manifest.readOrNull()
      if (bytes != null) {
        try {
          val value = JSONObject(String(bytes, Charsets.UTF_8))
          personalKeys(value, listOf("version", "phase", "rows"))
          if (value.opt("version") != 1 || value.opt("phase") !in listOf("prepared", "committed")) throw IOException("Invalid private journal")
          val rows = value.getJSONArray("rows"); if (rows.length() !in 1..4) throw IOException("Invalid transaction size")
          val targets = mutableSetOf<String>()
          for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i); personalKeys(row, listOf("target", "before", "after"))
            if (!targets.add(File(row.getString("target")).canonicalPath)) throw IOException("Duplicate transaction target")
          }
          applyRows(rows, if (value.getString("phase") == "committed") "after" else "before")
        } finally { bytes.fill(0) }
      }
      cleanup(); available = true
    } catch (error: Exception) { available = false; throw IOException("Private transaction recovery unavailable", error) }
  }
  @Synchronized fun commit(writes: List<AtomicPrivateWrite>) {
    requireAvailable(); ensureDirectory()
    if (manifest.file.exists()) recover()
    if (writes.isEmpty() || writes.size > 4 || writes.map { it.file.canonicalPath }.distinct().size != writes.size || writes.any { !allowedTarget(it.file) }) throw IOException("Invalid private transaction")
    val rows = JSONArray(); val id = UUID.randomUUID().toString()
    var prepared = false; var committed = false; var writingMarker = false
    try {
      for ((index, write) in writes.withIndex()) {
        val row = JSONObject().put("target", write.file.canonicalPath).put("before", JSONObject.NULL).put("after", JSONObject.NULL)
        if (write.file.exists()) {
          if (write.file.length() > 128L * 1024 * 1024) throw IOException("Private target too large")
          val before = write.file.readBytes()
          try { val name = "$id-$index-before.piece"; writePiece(name, before); row.put("before", name) } finally { before.fill(0) }
        }
        write.bytes?.let { val name = "$id-$index-after.piece"; writePiece(name, it); row.put("after", name) }
        rows.put(row)
      }
      val value = JSONObject().put("version", 1).put("phase", "prepared").put("rows", rows)
      writingMarker = true; manifest.write(value.toString().toByteArray()); writingMarker = false; prepared = true; checkpoint("prepared")
      applyRows(rows, "after"); checkpoint("replaced")
      value.put("phase", "committed"); writingMarker = true; manifest.write(value.toString().toByteArray()); writingMarker = false; committed = true
      checkpoint("committed")
      writes.forEach { it.afterCommit() }
      cleanup()
    } catch (error: Exception) {
      if (writingMarker && error is AtomicDurabilityUncertain) {
        // The rename may survive or disappear after power loss; retain both directions and block writes.
        available = false
        throw IOException("Private transaction commit durability is uncertain", error)
      }
      if (!committed && prepared) {
        try { applyRows(rows, "before"); cleanup() } catch (rollback: Exception) { available = false; error.addSuppressed(rollback) }
      } else if (!prepared) directory.listFiles()?.filter { it.name.startsWith(id) && it.name.endsWith(".piece") }?.forEach { it.delete() }
      // A committed transaction remains committed even if cleanup/publishing failed.
      if (committed) available = false
      throw IOException("Private transaction unavailable", error)
    }
  }
}
