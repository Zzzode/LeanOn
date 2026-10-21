package com.zzzode.leanon.personal

import org.json.JSONObject
import java.io.IOException
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/** Platform-independent authenticated bytes; envelope fields never contain health plaintext. */
internal object PersonalCrypto {
  private val random = SecureRandom()
  fun randomBytes(count: Int): ByteArray = ByteArray(count).also(random::nextBytes)
  fun encode(bytes: ByteArray): String = Base64.getEncoder().encodeToString(bytes)
  fun decode(value: Any?, count: Int? = null, maximum: Int = 64 * 1024 * 1024): ByteArray {
    if (value !is String) throw IOException("Invalid encrypted bytes")
    val limit = count ?: maximum
    if (value.length.toLong() > ((limit.toLong() + 2) / 3) * 4 || value.length % 4 != 0) throw IOException("Encrypted bytes exceed supported size")
    val bytes = try { Base64.getDecoder().decode(value) } catch (_: IllegalArgumentException) { throw IOException("Invalid encrypted bytes") }
    if (bytes.size > maximum || encode(bytes) != value || count != null && bytes.size != count) throw IOException("Invalid encrypted bytes")
    return bytes
  }
  fun encrypt(key: SecretKey, plain: ByteArray, aad: ByteArray, nonce: ByteArray? = null): Pair<ByteArray, ByteArray> {
    require(nonce == null || nonce.size == 12)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    if (nonce == null) cipher.init(Cipher.ENCRYPT_MODE, key)
    else cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, nonce))
    cipher.updateAAD(aad)
    val actualNonce = cipher.iv
    check(actualNonce.size == 12) { "Unsupported AES-GCM nonce" }
    return actualNonce to cipher.doFinal(plain)
  }
  fun decrypt(key: SecretKey, nonce: ByteArray, sealed: ByteArray, aad: ByteArray): ByteArray {
    if (nonce.size != 12 || sealed.size < 16) throw IOException("Invalid encrypted bytes")
    try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, nonce)); cipher.updateAAD(aad)
      return cipher.doFinal(sealed)
    } catch (error: Exception) { throw IOException("Encrypted data cannot be authenticated", error) }
  }
  fun localEnvelope(key: SecretKey, plain: ByteArray, namespace: String): String {
    val (nonce, sealed) = encrypt(key, plain, "LeanOn local v1:$namespace".toByteArray())
    return JSONObject().put("version", 1).put("cipher", "AES-256-GCM")
      .put("nonce", encode(nonce)).put("ciphertext", encode(sealed)).toString()
  }
  fun localOpen(key: SecretKey, value: String, namespace: String): ByteArray {
    try {
      val envelope = strictJsonObject(value)
      if (envelope.length() != 4 || envelope.opt("version") !is Number || envelope.getDouble("version") != 1.0 || envelope.opt("cipher") != "AES-256-GCM") throw IOException("Unsupported encrypted envelope")
      return decrypt(key, decode(envelope.opt("nonce"), 12), decode(envelope.opt("ciphertext")), "LeanOn local v1:$namespace".toByteArray())
    } catch (error: IOException) { throw error }
    catch (error: Exception) { throw IOException("Invalid encrypted envelope", error) }
  }
  fun passwordKey(password: String, salt: ByteArray): SecretKey {
    require(salt.size == 16)
    val spec = PBEKeySpec(password.toCharArray(), salt, 600_000, 256)
    return try { SecretKeySpec(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded, "AES") }
    finally { spec.clearPassword() }
  }
}

internal fun strictJsonObject(value: String): JSONObject {
  val reader = org.json.JSONTokener(value)
  val objectValue = reader.nextValue() as? JSONObject ?: throw IOException("JSON object required")
  if (reader.nextClean() != '\u0000') throw IOException("Trailing JSON content")
  return objectValue
}
