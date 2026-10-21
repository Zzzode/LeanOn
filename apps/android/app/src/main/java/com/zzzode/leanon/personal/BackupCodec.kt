package com.zzzode.leanon.personal

import com.zzzode.leanon.data.migrateDailyRecords
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.time.OffsetDateTime

internal object BackupCodec {
  const val MAX_FILE_BYTES = 64 * 1024 * 1024
  val recordsFields = listOf("schemaVersion", "revision", "setupCompleted", "profile", "goalWeightKg", "weeklyLossKg", "guidanceMode", "safetyFlags", "weights", "water", "exercises", "legacyIntake", "intakeEntries", "intake", "deletedRecords", "processedOperations")
  fun password(value: String): String {
    val bytes = value.toByteArray(Charsets.UTF_8)
    try { if (bytes.size !in 12..1024) personalInvalid("Passphrase must contain 12–1024 UTF-8 bytes") }
    finally { bytes.fill(0) }
    return value
  }
  fun seal(payload: JSONObject, password: String): ByteArray {
    validate(payload)
    val plain = payload.toString().toByteArray(); val salt = PersonalCrypto.randomBytes(16)
    try {
      val key = PersonalCrypto.passwordKey(password(password), salt)
      val (nonce, sealed) = PersonalCrypto.encrypt(key, plain, "LeanOn backup v1".toByteArray())
      val result = JSONObject().put("formatVersion", 1).put("cipher", "AES-256-GCM").put("kdf", "PBKDF2-HMAC-SHA256")
        .put("iterations", 600000).put("salt", PersonalCrypto.encode(salt)).put("nonce", PersonalCrypto.encode(nonce)).put("ciphertext", PersonalCrypto.encode(sealed)).toString().toByteArray()
      if (result.size > MAX_FILE_BYTES) throw IOException("Backup exceeds supported size")
      return result
    } finally { plain.fill(0) }
  }
  fun open(bytes: ByteArray, password: String): JSONObject {
    if (bytes.size > MAX_FILE_BYTES) personalInvalid("Backup exceeds supported size")
    val envelope = try { strictJsonObject(String(bytes, Charsets.UTF_8)) } catch (_: Exception) { personalInvalid("Invalid backup envelope") }
    personalKeys(envelope, listOf("formatVersion", "cipher", "kdf", "iterations", "salt", "nonce", "ciphertext"))
    if ((envelope.opt("formatVersion") as? Number)?.toDouble() != 1.0 || envelope.opt("cipher") != "AES-256-GCM" || envelope.opt("kdf") != "PBKDF2-HMAC-SHA256" || (envelope.opt("iterations") as? Number)?.toDouble() != 600000.0) personalInvalid("Unsupported backup envelope")
    val salt = PersonalCrypto.decode(envelope.opt("salt"), 16); val nonce = PersonalCrypto.decode(envelope.opt("nonce"), 12); val sealed = PersonalCrypto.decode(envelope.opt("ciphertext"))
    val key = PersonalCrypto.passwordKey(password(password), salt)
    val plain = try { PersonalCrypto.decrypt(key, nonce, sealed, "LeanOn backup v1".toByteArray()) }
    catch (_: IOException) { throw PersonalFailure("not-authorized", "Backup passphrase or authentication is incorrect") }
    try {
      val payload = try { strictJsonObject(String(plain, Charsets.UTF_8)) } catch (_: Exception) { personalInvalid("Invalid backup payload") }
      try { validate(payload) } catch (error: PersonalFailure) { throw error } catch (_: Exception) { personalInvalid("Invalid backup payload") }; return payload
    } finally { plain.fill(0); sealed.fill(0) }
  }
  fun hostData(payload: JSONObject): JSONObject = JSONObject(payload.getJSONObject("records").toString()).apply {
    for (key in listOf("customFoods", "favoriteFoodIds", "recentFoodIds")) put(key, payload.getJSONArray(key))
  }
  fun personalCollection(payload: JSONObject): JSONObject = JSONObject().put("version", 1).put("personal", payload.getJSONObject("personal")).put("photoBytes", JSONObject().apply {
    val rows = payload.getJSONArray("photos"); for (i in 0 until rows.length()) { val row = rows.getJSONObject(i); put(row.getString("id"), row.getString("bytesBase64")) }
  })
  fun validate(payload: JSONObject) {
    personalKeys(payload, listOf("formatVersion", "createdAt", "records", "customFoods", "favoriteFoodIds", "recentFoodIds", "personal", "photos"))
    if ((payload.opt("formatVersion") as? Number)?.toDouble() != 1.0) personalInvalid("Unsupported backup format")
    val date = payload.opt("createdAt") as? String ?: personalInvalid("Missing backup time")
    if (runCatching { OffsetDateTime.parse(date) }.isFailure) personalInvalid("Invalid backup time")
    validateBackupJson(payload)
    val records = payload.optJSONObject("records") ?: personalInvalid("Missing backup records")
    personalKeys(records, recordsFields)
    if ((records.opt("schemaVersion") as? Number)?.toDouble() != 2.0) personalInvalid("Unsupported backup records")
    for (key in listOf("weights", "water", "exercises", "legacyIntake", "intakeEntries", "intake", "deletedRecords", "processedOperations")) {
      val rows = records.optJSONArray(key) ?: personalInvalid("Missing record collection")
      if (rows.length() > 100000) personalInvalid("Record collection exceeds supported size")
    }
    val projected = migrateDailyRecords(hostData(payload))
    val projectedIntake = projected.getJSONArray("intake"); val intake = records.getJSONArray("intake")
    val byDate = (0 until intake.length()).associate { intake.getJSONObject(it).getString("date") to intake.getJSONObject(it) }
    if (byDate.size != intake.length() || projectedIntake.length() != intake.length()) personalInvalid("Backup intake projection disagrees")
    for (i in 0 until projectedIntake.length()) {
      val expected = projectedIntake.getJSONObject(i); val actual = byDate[expected.getString("date")] ?: personalInvalid("Backup intake date missing")
      if (kotlin.math.abs(expected.getDouble("kcal") - actual.getDouble("kcal")) > 1e-6) personalInvalid("Backup intake projection disagrees")
      for (group in listOf("macros", "micros")) for (field in expected.getJSONObject(group).keys())
        if (kotlin.math.abs(expected.getJSONObject(group).getDouble(field) - actual.getJSONObject(group).getDouble(field)) > 1e-6) personalInvalid("Backup nutrient projection disagrees")
    }
    validatePersonalState(payload.optJSONObject("personal") ?: personalInvalid("Missing personal state"))
    val foods = payload.optJSONArray("customFoods") ?: personalInvalid("Missing food collection")
    if (foods.length() > 10000) personalInvalid("Too many foods")
    val ids = mutableSetOf<String>()
    for (i in 0 until foods.length()) {
      val food = foods.optJSONObject(i) ?: personalInvalid("Invalid food"); personalKeys(food, listOf("id", "name", "kcal", "macros", "micros", "defaultGrams", "source", "barcode"))
      if (!ids.add(personalId(food.opt("id")))) personalInvalid("Duplicate food")
      if (food.opt("source") !in listOf("custom", "open-food-facts")) personalInvalid("Invalid food source")
      val names = food.optJSONObject("name") ?: personalInvalid("Missing food names")
      personalKeys(names, listOf("en", "zh-CN"))
      for (key in listOf("en", "zh-CN")) { val name = names.opt(key) as? String ?: personalInvalid("Invalid food name"); if (name.trim().isEmpty() || name.length > 1000) personalInvalid("Invalid food name") }
      personalNumber(food.opt("kcal"), Double.MIN_VALUE, Double.MAX_VALUE)
      if (food.has("barcode") && (food.opt("barcode") !is String || !food.getString("barcode").matches(Regex("[0-9]{8,14}")))) personalInvalid("Invalid food barcode")
      for (group in listOf("macros", "micros")) {
        val nutrients = food.optJSONObject(group) ?: personalInvalid("Missing nutrients")
        val fields = if (group == "macros") listOf("proteinG", "carbsG", "fatG") else listOf("fiberG", "sugarG", "saturatedFatG", "sodiumMg")
        personalKeys(nutrients, fields); for (field in fields) personalNumber(nutrients.opt(field), 0.0, Double.MAX_VALUE)
      }
      if (food.has("defaultGrams")) personalNumber(food.opt("defaultGrams"), Double.MIN_VALUE, Double.MAX_VALUE)
    }
    for (key in listOf("favoriteFoodIds", "recentFoodIds")) {
      val rows = payload.optJSONArray(key) ?: personalInvalid("Missing food ids")
      if (rows.length() > if (key == "recentFoodIds") 12 else 10000) personalInvalid("Too many food ids")
      val used = mutableSetOf<String>(); for (i in 0 until rows.length()) if (!used.add(personalId(rows.get(i)))) personalInvalid("Duplicate food id")
    }
    val photos = payload.optJSONArray("photos") ?: personalInvalid("Missing photo collection"); val metadata = payload.getJSONObject("personal").getJSONArray("photos")
    if (photos.length() != metadata.length()) personalInvalid("Photo metadata and bytes disagree")
    val photoIds = mutableSetOf<String>(); var total = 0L
    for (i in 0 until photos.length()) {
      val row = photos.optJSONObject(i) ?: personalInvalid("Invalid photo bytes"); personalKeys(row, listOf("id", "bytesBase64")); val id = personalId(row.opt("id"))
      if (!photoIds.add(id)) personalInvalid("Duplicate photo bytes")
      val image = (0 until metadata.length()).map { metadata.getJSONObject(it) }.firstOrNull { it.getString("id") == id } ?: personalInvalid("Photo metadata missing")
      val bytes = PersonalCrypto.decode(row.opt("bytesBase64"), maximum = 20 * 1024 * 1024)
      try {
        if (bytes.isEmpty() || bytes.size > 20 * 1024 * 1024) personalInvalid("Invalid photo size")
        total += bytes.size; if (total > 32L * 1024 * 1024) personalInvalid("Photo bytes exceed supported size")
        validateSanitizedJpeg(bytes, image.getInt("width"), image.getInt("height"))
      } finally { bytes.fill(0) }
    }
  }
  fun preview(payload: JSONObject): JSONObject {
    validate(payload)
    val records = payload.getJSONObject("records"); val personal = payload.getJSONObject("personal")
    val counts = JSONObject(); for (key in listOf("weights", "water", "exercises", "intakeEntries", "legacyIntake")) counts.put(key, records.getJSONArray(key).length())
    counts.put("customFoods", payload.getJSONArray("customFoods").length()).put("measurements", personal.getJSONArray("measurements").length()).put("photos", personal.getJSONArray("photos").length())
    var total = 0L; val photos = payload.getJSONArray("photos"); for (i in 0 until photos.length()) total += PersonalCrypto.decode(photos.getJSONObject(i).getString("bytesBase64")).size
    return JSONObject().put("createdAt", payload.getString("createdAt")).put("recordRevision", records.getLong("revision")).put("personalRevision", personal.getLong("revision"))
      .put("counts", counts).put("photoBytes", total).put("hasProfile", !records.isNull("profile")).put("includesPhotos", photos.length() > 0)
  }
}
/** Credential exemptions are based on exact structural paths, never attacker-supplied type alone. */
internal fun validateBackupJson(value: Any?) {
  val budget = intArrayOf(500000)
  fun visit(item: Any?, path: List<String>, depth: Int) {
    if (depth > 20 || --budget[0] < 0) personalInvalid("Backup JSON exceeds supported complexity")
    when (item) {
      is JSONObject -> {
        if (item.length() > 1000) personalInvalid("Backup object is too large")
        for (key in item.keys()) {
          val normalized = key.replace("-", "").replace("_", "").lowercase()
          if (normalized in setOf("password", "passphrase", "accesstoken", "refreshtoken", "sessiontoken", "authorization", "credentials", "privatekey", "secretkey", "apikey", "session", "wrappedkey", "wrapped", "invitesecret", "devicesecret", "vaultkey", "familykey", "proof", "proofhash", "clientsecret", "secret", "encryptionkey", "pendingaccountdeletion", "deletionproof", "capabilityproof", "deletecapability") || key in listOf("__proto__", "constructor", "prototype")) personalInvalid("Backup contains credentials")
          if (normalized == "token") {
            val tombstone = path.size == 3 && path[0] == "records" && path[1] == "deletedRecords"
            val restore = path.size == 4 && path[0] == "records" && path[1] == "processedOperations" && path[3] == "mutation" && item.opt("type") == "restore-record"
            if (!(tombstone || restore) || (item.opt(key) as? String)?.startsWith("undo-") != true) personalInvalid("Backup contains a token")
          }
          visit(item.get(key), path + key, depth + 1)
        }
      }
      is JSONArray -> { if (item.length() > 100000) personalInvalid("Backup array is too large"); for (i in 0 until item.length()) visit(item.get(i), path + i.toString(), depth + 1) }
      is Number -> if (!item.toDouble().isFinite()) personalInvalid("Invalid backup number")
      null, JSONObject.NULL, is String, is Boolean -> Unit
      else -> personalInvalid("Invalid backup JSON")
    }
  }
  visit(value, emptyList(), 0)
}
