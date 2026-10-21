package com.zzzode.leanon.personal

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.io.IOException

/** Compatible reads never migrate; a successful explicit write seals the document. */
internal class EncryptedLegacyJsonCodec(
  private val namespace: String,
  private val key: (Boolean) -> javax.crypto.SecretKey,
  private val establishedDocument: File? = null,
) {
  constructor(context: Context, namespace: String, document: File? = null) : this(namespace,
    PersonalKeyStore(context, File(context.filesDir, "$namespace-key-v1"), namespace)::key, document)
  fun read(file: File): String {
    if (file.length() > 64L * 1024 * 1024) throw IOException("Document exceeds supported size")
    val text = file.readText(Charsets.UTF_8)
    val json = JSONObject(text)
    if (!json.has("cipher") && !json.has("ciphertext")) return text
    val bytes = PersonalCrypto.localOpen(key(false), text, namespace)
    return try { String(bytes, Charsets.UTF_8) } finally { bytes.fill(0) }
  }
  fun encode(text: String): String {
    val existing = establishedDocument?.takeIf { it.exists() }?.let { JSONObject(it.readText(Charsets.UTF_8)) }
    val hasEncryptedData = existing?.let { it.has("cipher") || it.has("ciphertext") } ?: false
    val result = PersonalCrypto.localEnvelope(key(!hasEncryptedData), text.toByteArray(Charsets.UTF_8), namespace)
    if (result.toByteArray(Charsets.UTF_8).size > 64L * 1024 * 1024) throw IOException("Document exceeds supported size")
    return result
  }
}
