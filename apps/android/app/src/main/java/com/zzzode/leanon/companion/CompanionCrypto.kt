package com.zzzode.leanon.companion

import com.zzzode.leanon.personal.PersonalCrypto
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.security.MessageDigest
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** All relay crypto uses interoperable platform primitives, never server-held health keys. */
internal object CompanionCrypto {
  fun randomKey(): ByteArray = PersonalCrypto.randomBytes(32)
  fun encode(bytes: ByteArray): String = PersonalCrypto.encode(bytes)
  fun decode(value: Any?, length: Int? = null): ByteArray {
    if (value !is String || value.length > (((length ?: 64 * 1024 * 1024) + 2L) / 3L) * 4L) throw IOException("Invalid encrypted bytes")
    return PersonalCrypto.decode(value, length)
  }
  fun hash(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }
  fun hkdf(secret: ByteArray, salt: ByteArray, info: ByteArray, length: Int = 32): ByteArray {
    require(length in 1..8160)
    fun hmac(key: ByteArray, input: ByteArray): ByteArray = Mac.getInstance("HmacSHA256").run { init(SecretKeySpec(key, "HmacSHA256")); doFinal(input) }
    val prk = hmac(if (salt.isEmpty()) ByteArray(32) else salt, secret)
    var previous = ByteArray(0); val output = java.io.ByteArrayOutputStream()
    try {
      for (counter in 1..((length + 31) / 32)) { previous = hmac(prk, previous + info + byteArrayOf(counter.toByte())); output.write(previous) }
      return output.toByteArray().copyOf(length)
    } finally { prk.fill(0); previous.fill(0) }
  }
  fun inviteProof(secret: ByteArray, id: String): ByteArray = hkdf(secret, id.toByteArray(Charsets.UTF_8), "leanon-invite-proof-v1".toByteArray())
  fun inviteWrapKey(secret: ByteArray, id: String): ByteArray = hkdf(secret, id.toByteArray(Charsets.UTF_8), "leanon-invite-wrap-v1".toByteArray())
  fun seal(key: ByteArray, bytes: ByteArray, aad: ByteArray, nonce: ByteArray? = null): JSONObject {
    require(key.size == 32)
    val (actualNonce, sealed) = PersonalCrypto.encrypt(SecretKeySpec(key, "AES"), bytes, aad, nonce)
    return JSONObject().put("algorithm", "AES-256-GCM").put("nonce", encode(actualNonce))
      .put("ciphertext", encode(sealed.copyOfRange(0, sealed.size - 16))).put("tag", encode(sealed.copyOfRange(sealed.size - 16, sealed.size)))
  }
  fun open(key: ByteArray, envelope: JSONObject, aad: ByteArray): ByteArray {
    if (key.size != 32 || envelope.length() != 4 || envelope.optString("algorithm") != "AES-256-GCM") throw IOException("Invalid encrypted relay envelope")
    val bytes = decode(envelope.opt("ciphertext")); if (bytes.size > 64 * 1024 * 1024) throw IOException("Relay payload exceeds supported size")
    return PersonalCrypto.decrypt(SecretKeySpec(key, "AES"), decode(envelope.opt("nonce"), 12), bytes + decode(envelope.opt("tag"), 16), aad)
  }
  private fun wireId(value: Any?): String = (value as? String)?.takeIf { it.matches(Regex("[A-Za-z0-9_-]{1,128}")) } ?: throw IOException("Invalid relay identity")
  private fun integer(value: Any?): Long {
    val raw = value as? Number ?: throw IOException("Invalid relay number")
    val number = raw.toDouble()
    if (!number.isFinite() || number < 0 || number > 9007199254740991.0 || number % 1.0 != 0.0) throw IOException("Invalid relay number")
    return number.toLong()
  }
  fun aad(groupId: String, epoch: Long, ownerId: String, deviceId: String, change: JSONObject): ByteArray {
    if (epoch < 1 || epoch > 9007199254740991L) throw IOException("Invalid relay epoch")
    val kind = change.opt("kind") as? String ?: throw IOException("Invalid relay kind")
    if (kind !in listOf("record", "encouragement")) throw IOException("Invalid relay kind")
    val category = wireId(change.opt("category")); if (category !in CompanionRepository.CATEGORIES + listOf("vault", "vault-keyring")) throw IOException("Invalid relay category")
    val updatedAt = integer(change.opt("updatedAt"))
    val deleted = change.opt("deleted") as? Boolean ?: throw IOException("Invalid relay tombstone")
    return JSONArray().put("leanon-change-v1").put(wireId(groupId)).put(epoch).put(wireId(ownerId)).put(wireId(deviceId))
      .put(wireId(change.opt("id"))).put(wireId(change.opt("recordId"))).put(category).put(kind).put(updatedAt).put(deleted).toString().toByteArray(Charsets.UTF_8)
  }
  fun invitationCode(id: String, secret: ByteArray): String = "leanon-invite-v1:" + Base64.getUrlEncoder().withoutPadding()
    .encodeToString(("{\"id\":" + JSONObject.quote(id) + ",\"inviteSecret\":" + JSONObject.quote(encode(secret)) + "}").toByteArray(Charsets.UTF_8))
  fun parseInvitationCode(code: String): Pair<String, ByteArray> {
    if (!code.startsWith("leanon-invite-v1:") || code.length > 2048) throw CompanionFailure("invalid-request", "Invalid invitation")
    val encoded = code.removePrefix("leanon-invite-v1:")
    val decoded = try { Base64.getUrlDecoder().decode(encoded) } catch (_: Exception) { throw CompanionFailure("invalid-request", "Invalid invitation") }
    if (Base64.getUrlEncoder().withoutPadding().encodeToString(decoded) != encoded) throw CompanionFailure("invalid-request", "Invalid invitation")
    val value = JSONObject(String(decoded, Charsets.UTF_8))
    if (value.length() != 2) throw CompanionFailure("invalid-request", "Invalid invitation")
    val id = value.getString("id"); if (!id.matches(Regex("[A-Za-z0-9_-]{1,128}"))) throw CompanionFailure("invalid-request", "Invalid invitation")
    return id to decode(value.opt("inviteSecret"), 32)
  }
}
