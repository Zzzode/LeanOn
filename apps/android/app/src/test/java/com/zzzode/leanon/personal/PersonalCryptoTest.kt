package com.zzzode.leanon.personal

import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import javax.crypto.spec.SecretKeySpec

class PersonalCryptoTest {
  private val key = SecretKeySpec(ByteArray(32) { it.toByte() }, "AES")
  @Test fun localBytesAuthenticatedAndBoundToCollection() {
    val plain = "private measurement 82.5".toByteArray()
    val envelope = PersonalCrypto.localEnvelope(key, plain, "personal")
    assertFalse(envelope.contains("measurement"))
    assertArrayEquals(plain, PersonalCrypto.localOpen(key, envelope, "personal"))
    assertThrows(IOException::class.java) { PersonalCrypto.localOpen(key, envelope, "photos") }
    assertThrows(IOException::class.java) { PersonalCrypto.localOpen(SecretKeySpec(ByteArray(32), "AES"), envelope, "personal") }
  }
  @Test fun nonceRandomAndCiphertextTamperFails() {
    val aad = "test".toByteArray(); val plain = ByteArray(512) { it.toByte() }
    val a = PersonalCrypto.encrypt(key, plain, aad); val b = PersonalCrypto.encrypt(key, plain, aad)
    assertFalse(a.first.contentEquals(b.first)); a.second[0] = (a.second[0].toInt() xor 1).toByte()
    assertThrows(IOException::class.java) { PersonalCrypto.decrypt(key, a.first, a.second, aad) }
  }
  @Test fun emptyBytesAndCanonicalBase64RoundTrip() {
    val result = PersonalCrypto.encrypt(key, ByteArray(0), ByteArray(0))
    assertEquals(16, result.second.size)
    assertArrayEquals(ByteArray(0), PersonalCrypto.decrypt(key, result.first, result.second, ByteArray(0)))
    assertThrows(IOException::class.java) { PersonalCrypto.decode("AA", 1) }
    assertThrows(IOException::class.java) { PersonalCrypto.decode("AA==", 16) }
  }
  @Test fun passwordDerivationUsesRequiredIterationsAndExactUnicode() {
    val salt = ByteArray(16) { it.toByte() }
    val key1 = PersonalCrypto.passwordKey("passphrase-健康", salt).encoded
    assertEquals(32, key1.size)
    val unicodeKey = PersonalCrypto.passwordKey("fixture-健康🔑e\u0301-pass", salt).encoded
    assertEquals("b04e161e38244b8a3e1249d0e2fa1ceb980bc1e1722dd0ae16836a870fdac870", unicodeKey.joinToString("") { "%02x".format(it) })
    assertArrayEquals(key1, PersonalCrypto.passwordKey("passphrase-健康", salt).encoded)
    assertFalse(key1.contentEquals(PersonalCrypto.passwordKey("passphrase-健康 ", salt).encoded))
  }
}
