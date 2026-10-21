package com.zzzode.leanon.personal

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.io.IOException

/** Old plaintext is read-only compatible; every next explicit successful write is encrypted. */
internal class EncryptedRecordsCodec(context: Context) {
  private val keys = PersonalKeyStore(context, File(context.filesDir, "records-key-v1"), "records")
  fun eraseKeys() = keys.delete()
  fun read(file: File): String {
    if (file.length() > 64L * 1024 * 1024) throw IOException("Records exceed supported size")
    val text = file.readText(Charsets.UTF_8)
    val json = JSONObject(text)
    if (json.has("cipher") || json.has("ciphertext")) {
      val bytes = PersonalCrypto.localOpen(keys.key(false), text, "records")
      return try { String(bytes, Charsets.UTF_8) } finally { bytes.fill(0) }
    }
    return text
  }
  fun encode(contents: String): String {
    val encrypted = PersonalCrypto.localEnvelope(keys.key(true), contents.toByteArray(), "records")
    if (encrypted.toByteArray().size > 64L * 1024 * 1024) throw IOException("Records exceed supported size")
    return encrypted
  }
  fun write(file: File, contents: String) { com.zzzode.leanon.data.writeRecordsAtomically(file, encode(contents)) }
}
