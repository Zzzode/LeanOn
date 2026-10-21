package com.zzzode.leanon.personal

import android.content.Context
import android.net.Uri
import com.zzzode.leanon.data.writeBytesAtomically
import java.io.File
import java.io.IOException
import java.security.MessageDigest

/** Bounded content-addressed previews keep simultaneous gallery images stable until close/background. */
internal class PersonalPreviews(context: Context) {
  private val directory = File(context.cacheDir, "personal-previews")
  private val generations = mutableMapOf("own" to java.util.UUID.randomUUID().toString(), "partner" to java.util.UUID.randomUUID().toString())
  private var foreground = true
  private val issued = mutableMapOf<String, String>()
  @Synchronized fun setForeground(active: Boolean) { foreground = active }
  @Synchronized fun requestGeneration(scope: String): String {
    if (!foreground) throw IOException("Photo preview is unavailable in background")
    return generations[scope] ?: throw IOException("Unknown preview scope")
  }
  @Synchronized fun clear(scope: String? = null) {
    issued.keys.removeAll { scope == null || Uri.parse(it).lastPathSegment?.startsWith("$scope-") == true }
    (if (scope == null) listOf("own", "partner") else listOf(scope)).forEach { generations[it] = java.util.UUID.randomUUID().toString() }
    var failed = false
    directory.listFiles()?.filter { scope == null || it.name.startsWith("$scope-") }?.forEach {
      if (!it.delete() && it.exists()) failed = true
    }
    if (failed) {
      foreground = false
      throw IOException("Photo preview cleanup unavailable; access revoked")
    }
  }
  @Synchronized fun make(scope: String, id: String, bytes: ByteArray, expectedGeneration: String = requestGeneration(scope)): String {
    if (!foreground || generations[scope] != expectedGeneration) throw IOException("Photo preview request expired")
    if (scope !in listOf("own", "partner") || bytes.size > 20 * 1024 * 1024) throw IOException("Preview exceeds supported size")
    personalId(id)
    val now = System.currentTimeMillis()
    directory.listFiles()?.filter { now - it.lastModified() > 300000 }?.forEach { it.delete() }
    if (!directory.exists() && !directory.mkdirs()) throw IOException("Preview cache unavailable")
    val digest = MessageDigest.getInstance("SHA-256").apply { update(id.toByteArray()); update(0.toByte()); update(bytes) }.digest().joinToString("") { "%02x".format(it) }
    val file = File(directory, "$scope-${generations.getValue(scope)}-$digest.jpg")
    if (file.exists()) { file.setLastModified(now); return issue(file, bytes) }
    val existing = directory.listFiles()?.filter { it.extension == "jpg" }?.sortedBy { it.lastModified() } ?: emptyList()
    var total = existing.sumOf { it.length() }; var count = existing.size
    for (old in existing) {
      if (total + bytes.size <= 64L * 1024 * 1024 && count < 2000) break
      val size = old.length(); if (!old.delete()) throw IOException("Preview cache cleanup unavailable")
      total -= size; count--
    }
    if (total + bytes.size > 64L * 1024 * 1024 || count >= 2000) throw IOException("Preview cache exceeds supported size")
    try { writeBytesAtomically(file, bytes); return issue(file, bytes) }
    catch (error: Exception) { file.delete(); throw error }
  }

  private fun issue(file: File, bytes: ByteArray): String {
    issued.keys.removeAll { !File(Uri.parse(it).path ?: "").exists() }
    return Uri.fromFile(file.canonicalFile).toString().also { issued[it] = sha256(bytes) }
  }

  /** Image-service access is limited to current issued capabilities, never arbitrary URIs. */
  @Synchronized fun allows(uri: String): Boolean {
    if (!foreground) return false
    val expected = issued[uri] ?: return false
    return runCatching {
      val parsed = Uri.parse(uri)
      if (parsed.scheme != "file" || parsed.authority?.isNotEmpty() == true || parsed.query != null || parsed.fragment != null) return false
      val file = File(parsed.path ?: return false)
      if (file.absoluteFile != file.canonicalFile || file.parentFile?.canonicalFile != directory.canonicalFile ||
        !file.isFile || file.length() !in 1..20L * 1024 * 1024 || System.currentTimeMillis() - file.lastModified() > 300000) return false
      sha256(file.readBytes()) == expected
    }.getOrDefault(false)
  }

  @Synchronized fun deliverApproved(uri: String, deliver: () -> Unit): Boolean {
    if (!allows(uri)) return false
    deliver()
    return true
  }

  private fun sha256(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
