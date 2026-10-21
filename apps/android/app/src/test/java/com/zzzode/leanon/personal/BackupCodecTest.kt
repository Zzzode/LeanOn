package com.zzzode.leanon.personal

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.security.MessageDigest

class BackupCodecTest {
  private fun fixture() = JSONObject(javaClass.getResourceAsStream("/personal/public-backup-v1.json")!!.bufferedReader().use { it.readText() })
  private fun envelope() = javaClass.getResourceAsStream("/personal/public-backup-v1.envelope.json")!!.use { it.readBytes() }
  private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it) }
  @Test fun nodeUnicodeFixtureDecryptsExactNonEmptyPayloadAndKey() {
    val fixture = fixture(); val envelope = envelope()
    assertEquals("584be6a5b6ed29ec690417fb8aba28567265a5d739ca7022d13a0d90ad75736b", hex(MessageDigest.getInstance("SHA-256").digest(envelope)))
    val key = PersonalCrypto.passwordKey(fixture.getString("password"), PersonalCrypto.decode(JSONObject(String(envelope)).getString("salt"), 16))
    assertEquals(fixture.getString("derivedKeyHex"), hex(key.encoded))
    val encoded = JSONObject(String(envelope))
    val actual = PersonalCrypto.decrypt(key, PersonalCrypto.decode(encoded.getString("nonce"), 12), PersonalCrypto.decode(encoded.getString("ciphertext")), "LeanOn backup v1".toByteArray())
    assertArrayEquals(PersonalCrypto.decode(fixture.getString("plaintextUtf8Base64")), actual)
    assertEquals("fb4483275bf106a523340bff913f2c8705f413e31120e89b93d76fbb8a6547ea", hex(MessageDigest.getInstance("SHA-256").digest(actual)))
    val payload = BackupCodec.open(envelope, fixture.getString("password"))
    assertEquals(1, payload.getJSONArray("photos").length())
    assertTrue(payload.getJSONObject("personal").getJSONObject("dietaryPreferences").getJSONObject("future").isNull("nullable"))
    assertEquals(264, BackupCodec.preview(payload).getInt("photoBytes"))
  }
  @Test fun wrongPasswordAndTamperNeverExposePayload() {
    assertEquals("not-authorized", assertThrows(PersonalFailure::class.java) { BackupCodec.open(envelope(), "wrong public password") }.code)
    val value = JSONObject(String(envelope())); val bytes = PersonalCrypto.decode(value.getString("ciphertext")); bytes[0] = (bytes[0].toInt() xor 1).toByte(); value.put("ciphertext", PersonalCrypto.encode(bytes))
    assertEquals("not-authorized", assertThrows(PersonalFailure::class.java) { BackupCodec.open(value.toString().toByteArray(), fixture().getString("password")) }.code)
  }
  @Test fun legacyValidFoodsAndPreferenceNullRoundTrip() {
    val payload = BackupCodec.open(envelope(), fixture().getString("password"))
    val food = JSONObject("{\"id\":\"food-fixture\",\"name\":{\"en\":\"Fixture\",\"zh-CN\":\"测试\"},\"source\":\"custom\",\"kcal\":12000,\"macros\":{\"proteinG\":0,\"carbsG\":0,\"fatG\":0},\"micros\":{\"fiberG\":0,\"sugarG\":0,\"saturatedFatG\":0,\"sodiumMg\":0}}")
    payload.getJSONArray("customFoods").put(food); BackupCodec.validate(payload)
    val roundTrip = BackupCodec.open(BackupCodec.seal(payload, fixture().getString("password")), fixture().getString("password"))
    assertEquals(12000, roundTrip.getJSONArray("customFoods").getJSONObject(0).getInt("kcal"))
    food.getJSONObject("macros").put("extra", 0)
    assertThrows(PersonalFailure::class.java) { BackupCodec.validate(payload) }
  }
  @Test fun metadataInLaterScanIsRejectedAndPickerOutputCanStripIt() {
    val payload = BackupCodec.open(envelope(), fixture().getString("password"))
    val bytes = PersonalCrypto.decode(payload.getJSONArray("photos").getJSONObject(0).getString("bytesBase64"))
    val comment = byteArrayOf(-1, -2, 0, 7, 104, 101, 108, 108, 111)
    val withMetadata = bytes.copyOfRange(0, bytes.size - 2) + comment + byteArrayOf(-1, -39)
    assertThrows(java.io.IOException::class.java) { validateSanitizedJpeg(withMetadata, 4, 4) }
    assertArrayEquals(bytes, stripEncodedJpegMetadata(withMetadata))
    validateSanitizedJpeg(bytes, 4, 4)
  }
  @Test fun forgedUndoContextAndUnknownFieldsRejected() {
    val payload = BackupCodec.open(envelope(), fixture().getString("password"))
    payload.getJSONObject("personal").getJSONObject("dietaryPreferences").put("future", JSONObject().put("type", "restore-record").put("token", "undo-forged"))
    assertThrows(PersonalFailure::class.java) { BackupCodec.validate(payload) }
    assertThrows(PersonalFailure::class.java) { BackupCodec.password("too short") }
    assertThrows(PersonalFailure::class.java) { BackupCodec.password("x".repeat(1025)) }
  }
  @Test fun privateAccountDeletionCapabilityAliasesCannotEnterPortableBackup() {
    val base = BackupCodec.open(envelope(), fixture().getString("password"))
    for (alias in listOf("pendingAccountDeletion", "deletion_proof", "capability-proof", "deleteCapability")) {
      val payload = JSONObject(base.toString())
      payload.getJSONObject("personal").getJSONObject("dietaryPreferences").put("future", JSONObject().put(alias, "PUBLIC rejected credential fixture"))
      assertThrows(PersonalFailure::class.java) { BackupCodec.validate(payload) }
    }
  }

}
