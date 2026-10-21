package com.zzzode.leanon.data

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.time.LocalDate
import java.time.Clock

internal class RecordsFailure(val code: String, message: String) : Exception(message)

internal fun invalid(message: String): Nothing = throw RecordsFailure("invalid-request", message)
internal fun strictString(value: JSONObject, key: String): String = (value.opt(key) as? String)?.takeIf { it.isNotBlank() } ?: invalid("Invalid $key")
internal fun strictId(value: JSONObject, key: String): String = strictString(value, key).also { if (it.trim() != it) invalid("Invalid $key") }
internal fun validateSource(value: JSONObject) { if (value.has("source") && value.opt("source") !in listOf("leanon", "healthkit", "health_connect")) invalid("Invalid source") }
internal fun strictNumber(value: JSONObject, key: String, low: Double = 0.0, high: Double = Double.MAX_VALUE): Double {
  val raw = value.opt(key) as? Number ?: invalid("Invalid $key")
  val number = raw.toDouble()
  if (!number.isFinite() || number < low || number > high) invalid("Invalid $key")
  return number
}
internal fun strictDate(value: JSONObject, key: String = "date"): String {
  val text = strictString(value, key)
  if (!text.matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}")) || runCatching { LocalDate.parse(text).let { it.year >= 1 && it.toString() == text } }.getOrDefault(false).not()) invalid("Invalid $key")
  return text
}
internal fun owned(value: JSONObject): Boolean = !value.has("source") || value.isNull("source") || value.optString("source") == "leanon"
internal fun emptyDailyRecords(): JSONObject = JSONObject()
  .put("schemaVersion", 2).put("revision", 0).put("setupCompleted", false)
  .put("profile", JSONObject.NULL).put("goalWeightKg", JSONObject.NULL).put("weeklyLossKg", JSONObject.NULL)
  .put("guidanceMode", "tracking-only").put("safetyFlags", JSONObject().put("pregnant", JSONObject.NULL).put("breastfeeding", JSONObject.NULL).put("eatingDisorderRisk", JSONObject.NULL))
  .apply { for (key in listOf("weights", "water", "exercises", "intake", "legacyIntake", "intakeEntries", "customFoods", "favoriteFoodIds", "recentFoodIds", "deletedRecords", "processedOperations")) put(key, JSONArray()) }

/** Upgrade aggregate history without inventing individual meals. */
internal fun migrateDailyRecords(input: JSONObject, clock: Clock = Clock.systemDefaultZone()): JSONObject {
  val version = input.opt("schemaVersion")
  if (version != null && (version !is Number || version.toDouble() !in listOf(1.0, 2.0))) throw IOException("Unsupported record schema")
  val data = JSONObject(input.toString())
  for (key in listOf("weights", "intake")) if (data.opt(key) !is JSONArray) throw IOException("Invalid record array $key")
  for (key in listOf("water", "exercises", "customFoods", "favoriteFoodIds", "recentFoodIds")) {
    if (!data.has(key) && (version as? Number)?.toInt() != 2) data.put(key, JSONArray())
    if (data.opt(key) !is JSONArray) throw IOException("Invalid record array $key")
  }
  if ((version as? Number)?.toInt() != 2) {
    data.put("schemaVersion", 2).put("revision", 0).put("legacyIntake", JSONArray(data.getJSONArray("intake").toString()))
      .put("intakeEntries", JSONArray()).put("deletedRecords", JSONArray()).put("processedOperations", JSONArray())
    val complete = data.opt("profile") is JSONObject
    if (complete) try {
      val candidate = JSONObject().put("type", "save-profile").put("profile", data.getJSONObject("profile"))
        .put("goalWeightKg", JSONObject.NULL).put("weeklyLossKg", JSONObject.NULL).put("guidanceMode", "tracking-only")
        .put("safetyFlags", emptyDailyRecords().getJSONObject("safetyFlags"))
      validateProfileMutation(candidate, emptyDailyRecords(), clock)
    } catch (error: Exception) { throw IOException("Invalid legacy profile; file preserved", error) }
    if (data.has("profile") && !data.isNull("profile") && !complete) throw IOException("Invalid legacy profile")
    data.put("legacyGuidance", JSONObject().apply { for (key in listOf("goalWeightKg", "weeklyLossKg")) if (data.has(key)) put(key, data.get(key)) })
    data.put("setupCompleted", complete)
    if (!complete) data.put("profile", JSONObject.NULL)
    if (!data.has("goalWeightKg")) data.put("goalWeightKg", JSONObject.NULL)
    if (!data.has("weeklyLossKg")) data.put("weeklyLossKg", JSONObject.NULL)
    data.put("guidanceMode", "tracking-only").put("safetyFlags", JSONObject().put("pregnant", JSONObject.NULL).put("breastfeeding", JSONObject.NULL).put("eatingDisorderRisk", JSONObject.NULL))
  }
  try {
    strictNumber(data, "revision", 0.0, 9007199254740991.0).also { if (it % 1 != 0.0) invalid("Invalid revision") }
    if (data.opt("setupCompleted") !is Boolean) invalid("Invalid setup flag")
    if (!data.has("profile") || (!data.isNull("profile") && data.opt("profile") !is JSONObject)) invalid("Invalid profile")
    if (data.optString("guidanceMode") !in listOf("tracking-only", "weight-loss")) invalid("Invalid guidance mode")
    val flags = data.optJSONObject("safetyFlags") ?: invalid("Invalid safety flags")
    for (key in listOf("pregnant", "breastfeeding", "eatingDisorderRisk")) if (!flags.has(key) || (!flags.isNull(key) && flags.opt(key) !is Boolean)) invalid("Invalid safety flags")
    for (key in listOf("goalWeightKg", "weeklyLossKg")) {
      if (!data.has(key)) invalid("Missing $key")
      if (!data.isNull(key)) strictNumber(data, key)
    }
    for (key in listOf("legacyIntake", "intakeEntries", "deletedRecords", "processedOperations")) if (data.opt(key) !is JSONArray) invalid("Invalid $key")
    for (key in listOf("weights", "water", "exercises", "legacyIntake", "intakeEntries")) {
      val array = data.getJSONArray(key)
      if (key == "legacyIntake" && (version as? Number)?.toInt() != 2) {
        val used = mutableSetOf<String>()
        for (i in 0 until array.length()) {
          val row = array.getJSONObject(i); val base = "legacy-intake-${row.getString("date")}"
          val id = if (used.add(base)) base else "$base-$i".also { used.add(it) }
          if (!row.has("id")) row.put("id", id)
        }
      }
      val ids = mutableSetOf<String>()
      val dates = mutableSetOf<String>()
      for (i in 0 until array.length()) {
        val record = array.optJSONObject(i) ?: invalid("Invalid $key record")
        strictDate(record)
        val identity = if (key in listOf("weights", "water") && (version as? Number)?.toInt() != 2 && !record.has("id")) key + "-" + record.getString("date") else strictId(record, "id")
        if (!ids.add(identity)) invalid("Duplicate record identity")
        if (key in listOf("weights", "water") && !dates.add(record.getString("date"))) invalid("Duplicate record date")
        when (key) {
          "weights" -> {
            strictNumber(record, "weightKg", 20.0, 300.0); validateSource(record)
            val id = "weight-${record.getString("date")}"; if (!record.has("id") && (version as? Number)?.toInt() != 2) record.put("id", id)
            strictId(record, "id")
          }
          "water" -> {
            strictNumber(record, "amountMl")
            val id = "water-${record.getString("date")}"; if (!record.has("id") && (version as? Number)?.toInt() != 2) record.put("id", id)
            strictId(record, "id")
          }
          "exercises" -> validateExercise(record)
          "intakeEntries" -> validateIntakeEntry(record)
          else -> validateNutrients(record)
        }
      }
    }
    validateGuidanceFields(data, allowRetainedLegacyRate = true)
    if (!data.isNull("profile")) validateProfileFields(data.getJSONObject("profile"))
    if (data.getBoolean("setupCompleted") && data.isNull("profile")) invalid("Setup profile is missing")
    if (data.getString("guidanceMode") == "weight-loss" && (!data.getBoolean("setupCompleted") || data.isNull("profile"))) invalid("Weight-loss profile is missing")
    validateStoredMetadata(data)
    projectDailyIntake(data)
  } catch (error: RecordsFailure) { throw IOException("Corrupt persisted records", error) }
  return data
}

internal fun validateNutrients(value: JSONObject) {
  strictNumber(value, "kcal")
  for ((key, fields) in listOf("macros" to listOf("proteinG", "carbsG", "fatG"), "micros" to listOf("fiberG", "sugarG", "saturatedFatG", "sodiumMg"))) {
    val group = value.optJSONObject(key) ?: invalid("Invalid $key")
    for (field in fields) strictNumber(group, field)
  }
}
internal fun validateExercise(value: JSONObject) {
  strictId(value, "id"); strictDate(value); strictId(value, "typeId"); validateSource(value)
  strictNumber(value, "durationMin", 1.0, 1440.0); strictNumber(value, "kcal")
}
internal fun validateIntakeEntry(value: JSONObject) {
  strictId(value, "id"); strictDate(value); strictString(value, "name")
  if (strictString(value, "meal") !in listOf("breakfast", "lunch", "dinner", "snack")) invalid("Invalid meal")
  if (strictNumber(value, "grams") <= 0) invalid("Invalid intake amount")
  validateNutrients(value)
  if (value.has("foodId")) strictId(value, "foodId")
}
internal fun projectDailyIntake(data: JSONObject) {
  val totals = sortedMapOf<String, JSONObject>()
  for (key in listOf("legacyIntake", "intakeEntries")) {
    val array = data.getJSONArray(key)
    for (i in 0 until array.length()) {
      val record = array.getJSONObject(i); val date = record.getString("date")
      val total = totals.getOrPut(date) { JSONObject().put("date", date).put("kcal", 0.0)
        .put("macros", JSONObject().put("proteinG", 0.0).put("carbsG", 0.0).put("fatG", 0.0))
        .put("micros", JSONObject().put("fiberG", 0.0).put("sugarG", 0.0).put("saturatedFatG", 0.0).put("sodiumMg", 0.0)) }
      total.put("kcal", total.getDouble("kcal") + record.getDouble("kcal"))
      for (group in listOf("macros", "micros")) for (field in record.getJSONObject(group).keys()) {
        val target = total.getJSONObject(group)
        if (target.has(field)) target.put(field, target.getDouble(field) + record.getJSONObject(group).getDouble(field))
      }
    }
  }
  data.put("intake", JSONArray(totals.values.toList()))
}

internal fun validateStoredMetadata(data: JSONObject) {
  fun revision(value: JSONObject, key: String) {
    val number = strictNumber(value, key, 1.0, data.getLong("revision").toDouble())
    if (number % 1.0 != 0.0) invalid("Invalid transaction revision")
  }
  val deletionReceipts = mutableMapOf<String, JSONObject>()
  val receiptIds = mutableSetOf<String>()
  val receipts = data.getJSONArray("processedOperations")
  for (i in 0 until receipts.length()) {
    val receipt = receipts.optJSONObject(i) ?: invalid("Invalid operation receipt")
    if (!receiptIds.add(strictId(receipt, "operationId"))) invalid("Duplicate operation identity")
    revision(receipt, "appliedRevision")
    if (receipt.has("undoToken") && strictId(receipt, "undoToken") != "undo-${receipt.getString("operationId")}") invalid("Invalid receipt undo token")
    val mutation = receipt.optJSONObject("mutation") ?: invalid("Invalid operation mutation")
    if (mutation.optString("type") != "delete-record" && receipt.has("undoToken")) invalid("Unexpected receipt undo token")
    when (strictString(mutation, "type")) {
      "save-profile" -> {
        validateProfileFields(mutation.optJSONObject("profile") ?: invalid("Invalid profile"))
        validateGuidanceFields(mutation, structuralOnly = true)
        if (mutation.has("initialWeightKg")) strictNumber(mutation, "initialWeightKg", 20.0, 300.0)
      }
      "set-weight", "set-water" -> {
        strictDate(mutation)
        if (mutation.has("id")) strictString(mutation, "id")
        if (mutation.getString("type") == "set-weight") strictNumber(mutation, "weightKg", 20.0, 300.0) else strictNumber(mutation, "amountMl")
      }
      "save-exercise" -> validateExercise(mutation.optJSONObject("exercise") ?: invalid("Invalid exercise"))
      "save-legacy-intake" -> { val sample = mutation.optJSONObject("sample") ?: invalid("Invalid legacy sample"); strictString(sample, "id"); strictDate(sample); validateNutrients(sample) }
      "save-intake" -> validateIntakeEntry(mutation.optJSONObject("entry") ?: invalid("Invalid entry"))
      "delete-record" -> {
        if (strictString(mutation, "kind") !in listOf("weight", "water", "exercise", "intake", "legacy-intake")) invalid("Invalid record kind")
        strictString(mutation, "id")
        if (!receipt.has("undoToken")) invalid("Missing deletion receipt undo token")
        deletionReceipts[strictId(receipt, "undoToken")] = receipt
      }
      "restore-record" -> strictString(mutation, "token")
      else -> invalid("Invalid receipt mutation")
    }
  }
  val tokens = mutableSetOf<String>(); val trash = data.getJSONArray("deletedRecords")
  for (i in 0 until trash.length()) {
    val tombstone = trash.optJSONObject(i) ?: invalid("Invalid deleted record")
    if (!tokens.add(strictString(tombstone, "token"))) invalid("Duplicate undo token")
    revision(tombstone, "deletedRevision")
    if (runCatching { java.time.OffsetDateTime.parse(strictString(tombstone, "deletedAt")) }.isFailure) invalid("Invalid deletion timestamp")
    val record = tombstone.optJSONObject("record") ?: invalid("Invalid deleted payload")
    strictId(record, "id"); strictDate(record)
    val receipt = deletionReceipts[tombstone.getString("token")] ?: invalid("Deleted record has no operation receipt")
    val deletion = receipt.getJSONObject("mutation")
    if (receipt.getLong("appliedRevision") != tombstone.getLong("deletedRevision") ||
        deletion.getString("kind") != tombstone.getString("kind") || deletion.getString("id") != record.getString("id")) invalid("Deleted record receipt mismatch")
    if (!owned(record)) invalid("External deleted record")
    when (strictString(tombstone, "kind")) {
      "weight" -> strictNumber(record, "weightKg", 20.0, 300.0)
      "water" -> strictNumber(record, "amountMl")
      "exercise" -> validateExercise(record)
      "legacy-intake" -> validateNutrients(record)
      "intake" -> validateIntakeEntry(record)
      else -> invalid("Invalid deleted kind")
    }
  }
}
internal fun validateProfileFields(profile: JSONObject) {
  strictDate(profile, "birthDate"); strictNumber(profile, "heightCm", 80.0, 250.0)
  if (strictString(profile, "sex") !in listOf("male", "female")) invalid("Invalid sex")
  if (strictString(profile, "activityLevel") !in listOf("sedentary", "lightly_active", "moderately_active", "very_active", "extremely_active")) invalid("Invalid activity level")
  if (profile.has("bodyFatPercent") && (strictNumber(profile, "bodyFatPercent") <= 0 || strictNumber(profile, "bodyFatPercent") >= 1)) invalid("Invalid body fat")
}
internal fun validateGuidanceFields(data: JSONObject, allowRetainedLegacyRate: Boolean = false, structuralOnly: Boolean = false) {
  if (strictString(data, "guidanceMode") !in listOf("tracking-only", "weight-loss")) invalid("Invalid guidance mode")
  val flags = data.optJSONObject("safetyFlags") ?: invalid("Invalid safety flags")
  for (key in listOf("pregnant", "breastfeeding", "eatingDisorderRisk")) if (!flags.has(key) || (!flags.isNull(key) && flags.opt(key) !is Boolean)) invalid("Invalid safety flags")
  if (!data.has("goalWeightKg") || !data.has("weeklyLossKg")) invalid("Missing goals")
  if (!data.isNull("goalWeightKg")) strictNumber(data, "goalWeightKg", 20.0, 300.0)
  if (!data.isNull("weeklyLossKg")) strictNumber(data, "weeklyLossKg")
  if (structuralOnly) return
  if (!allowRetainedLegacyRate && data.getString("guidanceMode") == "tracking-only" && !data.isNull("weeklyLossKg") && data.getDouble("weeklyLossKg") != 0.0) invalid("Tracking-only deficit")
  if (data.getString("guidanceMode") == "weight-loss" && (data.isNull("goalWeightKg") || data.isNull("weeklyLossKg") || data.getDouble("weeklyLossKg") !in 0.5..1.0 || listOf("pregnant", "breastfeeding", "eatingDisorderRisk").any { flags.opt(it) != false })) invalid("Invalid weight-loss guidance")
}
