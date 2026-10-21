package com.zzzode.leanon.companion

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class CompanionPhotoProtocolTest {
  private val key = ByteArray(32) { it.toByte() }
  private val expected = "AAECAwQFBgcICQoLXjUyYCopsRIz0yavJoWMMZd+KgMZxZ+7jQ4gRYE7t39njRPs"
  @Test fun frozenIndependentNodeVectorAndRoutingTamper() {
    val packet = CompanionPhotoProtocol.packet("PUBLIC photo fixture".toByteArray(), key, "public-group", 1, "public-owner", "public-device", "public-object", ByteArray(12) { it.toByte() })
    assertEquals(expected, CompanionCrypto.encode(packet))
    assertArrayEquals("PUBLIC photo fixture".toByteArray(), CompanionPhotoProtocol.open(packet, key, "public-group", 1, "public-owner", "public-device", "public-object"))
    for ((group, epoch, owner, device, objectId) in listOf(
      listOf("wrong-group", "1", "public-owner", "public-device", "public-object"),
      listOf("public-group", "2", "public-owner", "public-device", "public-object"),
      listOf("public-group", "1", "wrong-owner", "public-device", "public-object"),
      listOf("public-group", "1", "public-owner", "wrong-device", "public-object"),
      listOf("public-group", "1", "public-owner", "public-device", "wrong-object")
    )) assertThrows(IOException::class.java) { CompanionPhotoProtocol.open(packet, key, group, epoch.toLong(), owner, device, objectId) }
  }
  @Test fun authenticatedManifestPreservesBytesAndRejectsOuterReferenceSubstitution() {
    val original = JSONObject().put("version", 1).put("kind", "family-category").put("category", "photos").put("data", JSONArray()).put("photoBytes", JSONArray().put(JSONObject().put("id", "public-photo").put("bytesBase64", CompanionCrypto.encode("PUBLIC photo fixture".toByteArray()))))
    val prepared = CompanionPhotoProtocol.prepare(original, key, "public-group", 1, "public-owner", "public-device")
    assertFalse(prepared.plain.toString().contains("bytesBase64"))
    val packet = CompanionCrypto.decode(prepared.packets.getJSONObject(0).getString("bytesBase64"))
    val change = JSONObject().put("objects", prepared.references)
    val hydrated = CompanionPhotoProtocol.hydrate(prepared.plain, change, key, "public-group", 1, "public-owner", "public-device") { packet.copyOf() }
    assertEquals(CompanionVaultMerge.canonical(original), CompanionVaultMerge.canonical(hydrated))
    val forged = JSONObject(change.toString()); forged.getJSONArray("objects").getJSONObject(0).put("digest", "0".repeat(64))
    assertThrows(IOException::class.java) { CompanionPhotoProtocol.hydrate(prepared.plain, forged, key, "public-group", 1, "public-owner", "public-device") { packet.copyOf() } }
  }
}
