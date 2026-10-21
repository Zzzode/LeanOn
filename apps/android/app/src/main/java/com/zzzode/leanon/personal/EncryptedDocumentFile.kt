package com.zzzode.leanon.personal

import com.zzzode.leanon.data.writeRecordsAtomically
import java.io.File
import java.io.IOException
import javax.crypto.SecretKey

/** An authenticated collection file with atomic replacement and no corrupt-data fallback. */
internal class EncryptedDocumentFile(
  internal val file: File,
  private val namespace: String,
  private val key: (Boolean) -> SecretKey,
  private val persist: (File, String) -> Unit = ::writeRecordsAtomically,
  internal val eraseKey: () -> Unit = {},
) {
  @Synchronized fun readOrNull(): ByteArray? {
    if (!file.exists()) return null
    if (file.length() > 64L * 1024 * 1024) throw IOException("Encrypted collection exceeds the supported size")
    return PersonalCrypto.localOpen(key(false), file.readText(Charsets.UTF_8), namespace)
  }
  @Synchronized fun prepare(bytes: ByteArray): ByteArray {
    val directory = file.parentFile ?: throw IOException("Secure directory unavailable")
    if (!directory.exists() && !directory.mkdirs()) throw IOException("Secure directory unavailable")
    val encrypted = PersonalCrypto.localEnvelope(key(true), bytes, namespace)
    if (encrypted.toByteArray(Charsets.UTF_8).size > 64L * 1024 * 1024) throw IOException("Encrypted collection exceeds the supported size")
    return encrypted.toByteArray(Charsets.UTF_8)
  }
  @Synchronized fun write(bytes: ByteArray) { persist(file, String(prepare(bytes), Charsets.UTF_8)) }
}
