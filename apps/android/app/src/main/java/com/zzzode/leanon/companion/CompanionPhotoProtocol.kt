package com.zzzode.leanon.companion

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.UUID

/** Version 2 keeps individually encrypted image bytes out of small D1 records. */
internal object CompanionPhotoProtocol {
  data class Prepared(val plain: JSONObject, val references: JSONArray, val packets: JSONArray)
  fun aad(group: String, epoch: Long, owner: String, device: String, objectId: String): ByteArray = JSONArray()
    .put("leanon-photo-v2").put(group).put(epoch).put(owner).put(device).put(objectId).toString().toByteArray(Charsets.UTF_8)
  fun key(groupKey: ByteArray, objectId: String): ByteArray = CompanionCrypto.hkdf(groupKey, objectId.toByteArray(Charsets.UTF_8), "leanon-photo-key-v2".toByteArray(Charsets.UTF_8))
  fun packet(bytes: ByteArray, groupKey: ByteArray, group: String, epoch: Long, owner: String, device: String, objectId: String, nonce: ByteArray? = null): ByteArray {
    if (bytes.size > 20 * 1024 * 1024) throw CompanionFailure("capacity", "Photo exceeds supported size")
    val derived = key(groupKey, objectId)
    return try { val sealed = CompanionCrypto.seal(derived, bytes, aad(group, epoch, owner, device, objectId), nonce); CompanionCrypto.decode(sealed.getString("nonce"), 12) + CompanionCrypto.decode(sealed.getString("tag"), 16) + CompanionCrypto.decode(sealed.getString("ciphertext")) } finally { derived.fill(0) }
  }
  fun open(packet: ByteArray, groupKey: ByteArray, group: String, epoch: Long, owner: String, device: String, objectId: String): ByteArray {
    if (packet.size !in 28..(20 * 1024 * 1024 + 28)) throw IOException("Invalid photo packet")
    val derived = key(groupKey, objectId)
    return try { CompanionCrypto.open(derived, JSONObject().put("algorithm", "AES-256-GCM").put("nonce", CompanionCrypto.encode(packet.copyOfRange(0,12))).put("tag", CompanionCrypto.encode(packet.copyOfRange(12,28))).put("ciphertext", CompanionCrypto.encode(packet.copyOfRange(28,packet.size))), aad(group, epoch, owner, device, objectId)) } finally { derived.fill(0) }
  }
  fun prepare(value: JSONObject, groupKey: ByteArray, group: String, epoch: Long, owner: String, device: String): Prepared {
    val source = if (value.optString("kind") == "vault-snapshot") value.getJSONObject("payload").getJSONArray("photos") else if (value.optString("kind") == "family-category" && value.optString("category") == "photos") value.getJSONArray("photoBytes") else JSONArray()
    if (source.length() == 0) return Prepared(value, JSONArray(), JSONArray())
    if (source.length() > 64) throw CompanionFailure("capacity", "Private relay supports at most 64 photos in one manifest")
    val stripped = JSONObject(value.toString()); if (stripped.optString("kind") == "vault-snapshot") stripped.getJSONObject("payload").put("photos", JSONArray()) else stripped.put("photoBytes", JSONArray())
    val mappings = JSONArray(); val packets = JSONArray(); val refs = mutableListOf<JSONObject>(); val ids = mutableSetOf<String>()
    for (i in 0 until source.length()) {
      val blob = source.getJSONObject(i); val photoId = blob.getString("id"); if (blob.length() != 2 || !ids.add(photoId)) throw IOException("Invalid photo blobs")
      val objectId = UUID.randomUUID().toString(); val bytes = CompanionCrypto.decode(blob.getString("bytesBase64"))
      val encrypted = try { packet(bytes, groupKey, group, epoch, owner, device, objectId) } finally { bytes.fill(0) }
      try { val ref = JSONObject().put("id", objectId).put("digest", CompanionCrypto.hash(encrypted)).put("size", encrypted.size); refs.add(ref); mappings.put(JSONObject().put("id", photoId).put("object", ref)); packets.put(JSONObject().put("id", objectId).put("bytesBase64", CompanionCrypto.encode(encrypted))) } finally { encrypted.fill(0) }
    }
    val sorted = JSONArray(refs.sortedBy { it.getString("id") })
    return Prepared(JSONObject().put("version", 2).put("kind", "photo-manifest").put("value", stripped).put("photos", mappings).put("objects", sorted), sorted, packets)
  }
  fun hydrate(value: JSONObject, outer: JSONObject, groupKey: ByteArray, group: String, epoch: Long, owner: String, device: String, read: (String) -> ByteArray): JSONObject {
    if (value.opt("version") != 2 && value.optDouble("version") != 2.0) { if (outer.optJSONArray("objects")?.length()?.let { it > 0 } == true) throw IOException("Unauthenticated photo references"); return value }
    if (value.length() != 5 || value.optString("kind") != "photo-manifest") throw IOException("Invalid photo manifest")
    val refs = value.getJSONArray("objects"); val exposed = outer.getJSONArray("objects"); val mappings = value.getJSONArray("photos")
    if (refs.length() !in 1..64 || mappings.length() != refs.length() || exposed.length() != refs.length()) throw IOException("Invalid photo manifest size")
    val indexed = mutableMapOf<String, JSONObject>(); var previous = ""
    for (i in 0 until refs.length()) { val ref = refs.getJSONObject(i); val supplied = exposed.getJSONObject(i); val id = ref.getString("id"); if (ref.length() != 3 || supplied.length() != 3 || id <= previous || id != supplied.getString("id") || ref.getString("digest") != supplied.getString("digest") || ref.getLong("size") != supplied.getLong("size")) throw IOException("Photo reference authentication failed"); indexed[id] = ref; previous = id }
    val recovered = JSONArray(); val photoIds = mutableSetOf<String>(); val used = mutableSetOf<String>()
    for (i in 0 until mappings.length()) {
      val mapping = mappings.getJSONObject(i); val photoId = mapping.getString("id"); val ref = mapping.getJSONObject("object"); val id = ref.getString("id"); val expected = indexed[id] ?: throw IOException("Unknown photo object")
      if (mapping.length() != 2 || ref.length() != 3 || !photoIds.add(photoId) || !used.add(id) || ref.getString("digest") != expected.getString("digest") || ref.getLong("size") != expected.getLong("size")) throw IOException("Invalid photo mapping")
      val packet = read(id); try { if (packet.size.toLong() != expected.getLong("size") || CompanionCrypto.hash(packet) != expected.getString("digest")) throw IOException("Photo digest failed"); val bytes = open(packet, groupKey, group, epoch, owner, device, id); try { recovered.put(JSONObject().put("id", photoId).put("bytesBase64", CompanionCrypto.encode(bytes))) } finally { bytes.fill(0) } } finally { packet.fill(0) }
    }
    val original = JSONObject(value.getJSONObject("value").toString()); if (original.optString("kind") == "vault-snapshot") original.getJSONObject("payload").put("photos", recovered) else if (original.optString("kind") == "family-category" && original.optString("category") == "photos") original.put("photoBytes", recovered) else throw IOException("Invalid photo manifest kind")
    return original
  }
  fun wire(change: JSONObject): JSONObject = JSONObject(change.toString()).also { it.remove("_photoPackets") }
}
