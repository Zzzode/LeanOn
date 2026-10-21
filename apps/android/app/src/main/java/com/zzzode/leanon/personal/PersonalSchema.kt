package com.zzzode.leanon.personal

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.OffsetDateTime

internal class PersonalFailure(val code: String, message: String) : Exception(message)
internal fun personalInvalid(message: String): Nothing = throw PersonalFailure("invalid-request", message)
internal const val MAX_PERSONAL_REVISION = 9_007_199_254_740_991L
internal val measurementFields = listOf("waistCm", "hipCm", "chestCm", "armCm", "thighCm", "neckCm")
internal fun emptyPersonal(): JSONObject = JSONObject().put("version", 1).put("revision", 0)
  .put("dietaryPreferences", JSONObject().put("pattern", "none").put("excludedFoodIds", JSONArray()).put("notes", ""))
  .put("measurements", JSONArray()).put("photos", JSONArray()).put("processedOperations", JSONArray())
internal fun personalKeys(value: JSONObject, allowed: List<String>) {
  if (value.keys().asSequence().any { it !in allowed }) personalInvalid("Unknown personal field")
}
internal fun personalId(raw: Any?): String = (raw as? String)?.takeIf { it.isNotEmpty() && it.length <= 256 && it.trim() == it && it.none { c -> c.code < 32 } }
  ?: personalInvalid("Invalid identity")
internal fun personalRevision(raw: Any?): Long {
  val n = (raw as? Number)?.toDouble() ?: personalInvalid("Invalid revision")
  if (!n.isFinite() || n < 0 || n > MAX_PERSONAL_REVISION.toDouble() || n % 1 != 0.0) personalInvalid("Invalid revision")
  return n.toLong()
}
internal fun personalDate(raw: Any?): String {
  val text = raw as? String ?: personalInvalid("Invalid date")
  if (!text.matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}")) || !runCatching { LocalDate.parse(text).let { it.year >= 1 && it.toString() == text } }.getOrDefault(false)) personalInvalid("Invalid date")
  return text
}
internal fun personalNote(raw: Any?, optional: Boolean = true) {
  if (raw == null && optional) return
  if (raw !is String || raw.length > 2000) personalInvalid("Invalid note")
}
internal fun personalNumber(raw: Any?, minimum: Double, maximum: Double): Double {
  val n = (raw as? Number)?.toDouble() ?: personalInvalid("Invalid number")
  if (!n.isFinite() || n < minimum || n > maximum) personalInvalid("Invalid number")
  return n
}
private val credentialNames = setOf("password", "passphrase", "accesstoken", "refreshtoken", "sessiontoken", "authorization", "credentials", "privatekey", "secretkey", "apikey", "session", "wrappedkey", "wrapped", "token", "invitesecret", "devicesecret", "vaultkey", "familykey", "proof", "proofhash", "clientsecret", "secret", "encryptionkey", "pendingaccountdeletion", "deletionproof", "capabilityproof", "deletecapability")
internal fun validatePersonalJson(value: Any?) {
  val budget = intArrayOf(500000)
  fun visit(value: Any?, depth: Int) {
  if (depth > 20 || --budget[0] < 0) personalInvalid("Personal JSON is too deep")
  when (value) {
    null, JSONObject.NULL -> Unit
    is Boolean, is String -> Unit
    is Number -> if (!value.toDouble().isFinite()) personalInvalid("Invalid number")
    is JSONArray -> { if (value.length() > 100000) personalInvalid("Array is too large"); for (i in 0 until value.length()) visit(value.get(i), depth + 1) }
    is JSONObject -> {
      if (value.length() > 1000) personalInvalid("Object is too large")
      for (key in value.keys()) {
        if (key in listOf("__proto__", "constructor", "prototype") || key.replace("-", "").replace("_", "").lowercase() in credentialNames) personalInvalid("Credentials are not personal data")
        visit(value.get(key), depth + 1)
      }
    }
    else -> personalInvalid("Invalid JSON")
  }
}
  visit(value, 0)
}
internal fun validateDietaryPreferences(value: JSONObject) {
  if (value.opt("pattern") !in listOf("none", "vegetarian", "vegan")) personalInvalid("Invalid dietary pattern")
  personalNote(value.opt("notes"), false)
  val ids = value.optJSONArray("excludedFoodIds") ?: personalInvalid("Missing exclusions")
  if (ids.length() > 1000) personalInvalid("Too many exclusions")
  val seen = mutableSetOf<String>(); for (i in 0 until ids.length()) if (!seen.add(personalId(ids.get(i)))) personalInvalid("Duplicate exclusion")
  if (value.toString().length > 32768) personalInvalid("Dietary preferences are too large")
  validatePersonalJson(value)
}
internal fun validateMeasurement(value: JSONObject) {
  personalKeys(value, listOf("id", "date", "note") + measurementFields); personalId(value.opt("id")); personalDate(value.opt("date")); personalNote(value.opt("note"))
  if (measurementFields.none(value::has)) personalInvalid("A measurement is required")
  for (key in measurementFields) if (value.has(key)) personalNumber(value.opt(key), 20.0, 300.0)
}
internal fun validateProgressPhoto(value: JSONObject) {
  personalKeys(value, listOf("id", "date", "view", "note", "createdAt", "mime", "width", "height"))
  personalId(value.opt("id")); personalDate(value.opt("date")); personalNote(value.opt("note"))
  if (value.opt("view") !in listOf("front", "side", "back", "other") || value.opt("mime") !in listOf("image/jpeg")) personalInvalid("Invalid photo metadata")
  for (key in listOf("width", "height")) if (personalNumber(value.opt(key), 1.0, 20000.0) % 1 != 0.0) personalInvalid("Invalid photo dimensions")
  val time = value.opt("createdAt") as? String ?: personalInvalid("Invalid photo time")
  if (!time.matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})")) || runCatching { OffsetDateTime.parse(time) }.isFailure) personalInvalid("Invalid photo time")
}
internal fun validatePersonalMutation(value: JSONObject) {
  when (value.opt("type")) {
    "set-dietary-preferences" -> { personalKeys(value, listOf("type", "preferences")); validateDietaryPreferences(value.optJSONObject("preferences") ?: personalInvalid("Missing preferences")) }
    "save-measurement" -> { personalKeys(value, listOf("type", "measurement")); validateMeasurement(value.optJSONObject("measurement") ?: personalInvalid("Missing measurement")) }
    "add-photo", "update-photo" -> { personalKeys(value, listOf("type", "photo")); validateProgressPhoto(value.optJSONObject("photo") ?: personalInvalid("Missing photo")) }
    "delete-measurement", "delete-photo" -> { personalKeys(value, listOf("type", "id")); personalId(value.opt("id")) }
    else -> personalInvalid("Unknown personal mutation")
  }
}
internal fun validatePersonalState(value: JSONObject) {
  validatePersonalJson(value)
  personalKeys(value, listOf("version", "revision", "dietaryPreferences", "measurements", "photos", "processedOperations"))
  if (value.opt("version") !is Number || value.getDouble("version") != 1.0) personalInvalid("Unsupported personal schema")
  val revision = personalRevision(value.opt("revision")); validateDietaryPreferences(value.optJSONObject("dietaryPreferences") ?: personalInvalid("Missing preferences"))
  for ((key, limit) in listOf("measurements" to 100000, "photos" to 1000, "processedOperations" to 100000)) {
    val rows = value.optJSONArray(key) ?: personalInvalid("Missing personal collection")
    if (rows.length() > limit) personalInvalid("Personal collection is too large")
    val identities = mutableSetOf<String>()
    for (i in 0 until rows.length()) {
      val row = rows.optJSONObject(i) ?: personalInvalid("Invalid personal row")
      when (key) {
        "measurements" -> validateMeasurement(row)
        "photos" -> validateProgressPhoto(row)
        else -> {
          personalKeys(row, listOf("operationId", "mutation", "appliedRevision"))
          val applied = personalRevision(row.opt("appliedRevision")); if (applied == 0L || applied > revision) personalInvalid("Invalid receipt revision")
          validatePersonalMutation(row.optJSONObject("mutation") ?: personalInvalid("Missing receipt mutation"))
        }
      }
      if (!identities.add(personalId(row.opt(if (key == "processedOperations") "operationId" else "id")))) personalInvalid("Duplicate personal identity")
    }
  }
}
internal fun personalCanonical(value: Any?): String = when (value) {
  is JSONObject -> value.keys().asSequence().sorted().joinToString(",", "{", "}") { JSONObject.quote(it) + ":" + personalCanonical(value.get(it)) }
  is JSONArray -> (0 until value.length()).joinToString(",", "[", "]") { personalCanonical(value.get(it)) }
  is Number -> JSONObject.numberToString(value)
  is String -> JSONObject.quote(value)
  null, JSONObject.NULL -> "null"
  else -> value.toString()
}
