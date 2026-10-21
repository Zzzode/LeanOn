package com.zzzode.leanon.personal

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.zzzode.leanon.data.writeRecordsAtomically
import java.io.File
import java.io.IOException
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.SecretKeySpec
import java.util.concurrent.ConcurrentHashMap

/** A Keystore-only master wraps a random DEK; neither secret is exported in a backup. */
internal class PersonalKeyStore(context: Context, private val directory: File, private val namespace: String) {
  private val alias = "${context.packageName}.leanon.$namespace.wrap.v1"
  private val wrapped = File(directory, "wrapped-dek.json")
  private fun master(create: Boolean): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(alias, null) as? SecretKey)?.let { return it }
    if (!create) throw IOException("Secure data key is unavailable")
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    return generator.generateKey()
  }
  fun key(create: Boolean): SecretKey = synchronized(locks.getOrPut(alias) { Any() }) {
    if (wrapped.exists()) {
      val bytes = PersonalCrypto.localOpen(master(false), wrapped.readText(), "wrapped-dek:$namespace")
      if (bytes.size != 32) { bytes.fill(0); throw IOException("Invalid secure data key") }
      return SecretKeySpec(bytes, "AES").also { bytes.fill(0) }
    }
    if (!create) throw IOException("Secure data key is unavailable")
    if (directory.exists() && directory.walkTopDown().any { it.isFile && it != wrapped && !it.name.endsWith(".tmp") }) throw IOException("Secure data key is missing for established collection")
    if (!directory.exists() && !directory.mkdirs()) throw IOException("Secure directory is unavailable")
    val bytes = PersonalCrypto.randomBytes(32)
    try {
      val envelope = PersonalCrypto.localEnvelope(master(true), bytes, "wrapped-dek:$namespace")
      writeRecordsAtomically(wrapped, envelope)
      return SecretKeySpec(bytes, "AES")
    } finally { bytes.fill(0) }
  }
  fun delete() = synchronized(locks.getOrPut(alias) { Any() }) {
    if (wrapped.exists()) { if (!wrapped.delete()) throw IOException("Wrapped key deletion unavailable"); com.zzzode.leanon.data.syncPrivateDirectory(directory) }
    KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(alias)
  }
  private companion object { val locks = ConcurrentHashMap<String, Any>() }
}
