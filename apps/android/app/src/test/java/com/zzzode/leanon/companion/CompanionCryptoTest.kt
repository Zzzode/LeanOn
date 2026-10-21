package com.zzzode.leanon.companion

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class CompanionCryptoTest {
  private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it.toInt() and 255) }
  private fun change() = JSONObject().put("id", "change-1").put("recordId", "photo-1").put("category", "photos").put("kind", "record").put("updatedAt", 123).put("deleted", false)
  @Test fun rfc5869Sha256WorkedVector() {
    val key = CompanionCrypto.hkdf(ByteArray(22) { 11 }, ByteArray(13) { it.toByte() }, ByteArray(10) { (240 + it).toByte() }, 42)
    assertEquals("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865", hex(key))
  }
  @Test fun exactNodePublicCipherAndInviteInteropFixture() {
    val value = JSONObject(javaClass.getResource("/companion/public-companion-crypto-v1.json")!!.readText())
    val key = CompanionCrypto.decode(value.get("key"), 32)
    val secret = CompanionCrypto.decode(value.get("inviteSecret"), 32)
    val id = value.getString("inviteId"); val aad = value.getString("aad").toByteArray()
    assertEquals(value.getString("proof"), CompanionCrypto.encode(CompanionCrypto.inviteProof(secret, id)))
    assertEquals(value.getString("wrapKey"), CompanionCrypto.encode(CompanionCrypto.inviteWrapKey(secret, id)))
    assertEquals(value.getString("invitationCode"), CompanionCrypto.invitationCode(id, secret))
    val plain = CompanionCrypto.decode(value.get("plaintext"))
    assertArrayEquals(plain, CompanionCrypto.open(key, value.getJSONObject("payload"), aad))
    assertEquals(CompanionVaultMerge.canonical(value.getJSONObject("payload")), CompanionVaultMerge.canonical(CompanionCrypto.seal(key, plain, aad, ByteArray(12))))
    assertArrayEquals(key, CompanionCrypto.open(CompanionCrypto.inviteWrapKey(secret, id), value.getJSONObject("wrappedRawGroupKey"), id.toByteArray()))
  }
  @Test fun exactAadAndMetadataTamperAuthentication() {
    val change = change(); val aad = CompanionCrypto.aad("group-1", 1, "owner-1", "device-1", change)
    assertEquals("[\"leanon-change-v1\",\"group-1\",1,\"owner-1\",\"device-1\",\"change-1\",\"photo-1\",\"photos\",\"record\",123,false]", String(aad))
    val key = ByteArray(32) { it.toByte() }; val bytes = "PUBLIC fixture only".toByteArray()
    val sealed = CompanionCrypto.seal(key, bytes, aad, ByteArray(12))
    assertArrayEquals(bytes, CompanionCrypto.open(key, sealed, aad))
    for ((field, value) in listOf("category" to "meals", "deleted" to true, "updatedAt" to 124)) {
      val tampered = JSONObject(change.toString()).put(field, value)
      assertThrows(IOException::class.java) { CompanionCrypto.open(key, sealed, CompanionCrypto.aad("group-1", 1, "owner-1", "device-1", tampered)) }
    }
    assertThrows(IOException::class.java) { CompanionCrypto.aad("group-1", 1, "owner-1", "device-1", JSONObject(change.toString()).put("updatedAt", 123.5)) }
    assertThrows(IOException::class.java) { CompanionCrypto.aad("group-1", 1, "owner-1", "device-1", JSONObject(change.toString()).put("deleted", "false")) }
    assertThrows(IOException::class.java) { CompanionCrypto.aad("group-1", 1, "owner-1", "device-1", JSONObject(change.toString()).put("category", "invented")) }
  }
  @Test fun invitationSecretWrapIsIndependentFromAcceptProof() {
    val secret = ByteArray(32) { (it + 1).toByte() }; val id = "PUBLIC-invite"
    val code = CompanionCrypto.invitationCode(id, secret); val parsed = CompanionCrypto.parseInvitationCode(code)
    assertEquals(id, parsed.first); assertArrayEquals(secret, parsed.second)
    assertThrows(CompanionFailure::class.java) { CompanionCrypto.parseInvitationCode(code + "=") }
    val proof = CompanionCrypto.inviteProof(secret, id); val wrap = CompanionCrypto.inviteWrapKey(secret, id)
    assertFalse(proof.contentEquals(wrap))
    val rawGroupKey = ByteArray(32) { (it + 10).toByte() }; val sealed = CompanionCrypto.seal(wrap, rawGroupKey, id.toByteArray())
    assertArrayEquals(rawGroupKey, CompanionCrypto.open(wrap, sealed, id.toByteArray()))
    assertThrows(IOException::class.java) { CompanionCrypto.open(proof, sealed, id.toByteArray()) }
  }
}
