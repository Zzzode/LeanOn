package com.zzzode.leanon.data

import org.json.JSONArray
import org.json.JSONObject
import java.time.Clock
import java.time.LocalDate
import java.time.Period
import java.time.Instant

internal fun canonicalJson(value: Any?): String = when (value) {
  null, JSONObject.NULL -> "null"
  is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(prefix = "{", postfix = "}") { JSONObject.quote(it) + ":" + canonicalJson(value.get(it)) }
  is JSONArray -> (0 until value.length()).joinToString(prefix = "[", postfix = "]") { canonicalJson(value.get(it)) }
  is Number -> value.toDouble().toString()
  is Boolean -> value.toString()
  else -> JSONObject.quote(value.toString())
}

internal fun validateProfileMutation(mutation: JSONObject, data: JSONObject, clock: Clock) {
  val profile = mutation.optJSONObject("profile") ?: invalid("Invalid profile")
  val today = LocalDate.now(clock)
  val birth = LocalDate.parse(strictDate(profile, "birthDate"))
  if (birth > today) invalid("Birth date is in the future")
  if (strictString(profile, "sex") !in listOf("male", "female")) invalid("Invalid sex")
  val height = strictNumber(profile, "heightCm", 80.0, 250.0)
  if (strictString(profile, "activityLevel") !in listOf("sedentary", "lightly_active", "moderately_active", "very_active", "extremely_active")) invalid("Invalid activity level")
  if (profile.has("bodyFatPercent") && (strictNumber(profile, "bodyFatPercent") <= 0.0 || strictNumber(profile, "bodyFatPercent") >= 1.0)) invalid("Invalid body fat")
  val flags = mutation.optJSONObject("safetyFlags") ?: invalid("Invalid safety flags")
  for (key in listOf("pregnant", "breastfeeding", "eatingDisorderRisk")) if (!flags.has(key) || (!flags.isNull(key) && flags.opt(key) !is Boolean)) invalid("Invalid safety flag")
  val mode = strictString(mutation, "guidanceMode")
  if (mode !in listOf("weight-loss", "tracking-only")) invalid("Invalid guidance mode")
  if (!mutation.has("goalWeightKg") || !mutation.has("weeklyLossKg")) invalid("Missing goal fields")
  val goal = if (mutation.isNull("goalWeightKg")) null else strictNumber(mutation, "goalWeightKg", 20.0, 300.0)
  val weekly = if (mutation.isNull("weeklyLossKg")) null else strictNumber(mutation, "weeklyLossKg")
  val initial = if (mutation.has("initialWeightKg")) strictNumber(mutation, "initialWeightKg", 20.0, 300.0) else null
  if (initial != null && data.getBoolean("setupCompleted")) invalid("Initial weight is only allowed during setup")
  if (mode == "tracking-only") {
    if (weekly != null && weekly != 0.0) invalid("Tracking-only has no loss target")
  } else {
    if (Period.between(birth, today).years < 20 || listOf("pregnant", "breastfeeding", "eatingDisorderRisk").any { flags.opt(it) != false }) invalid("Screening requires tracking-only")
    val weights = data.getJSONArray("weights")
    val current = initial ?: (0 until weights.length()).map { weights.getJSONObject(it) }
      .filter { it.getString("date") <= today.toString() }.maxByOrNull { it.getString("date") }?.getDouble("weightKg")
      ?: invalid("Current weight is required")
    val metres = height / 100.0
    if (goal == null || weekly == null || weekly !in 0.5..1.0 || (current != null && current / (metres * metres) < 18.5) || goal / (metres * metres) < 18.5) invalid("Goal requires tracking-only")
  }
}

internal fun applyDailyMutation(data: JSONObject, operationId: String, expectedRevision: Long, mutation: JSONObject, clock: Clock): JSONObject {
  if (operationId.isBlank() || operationId.trim() != operationId || expectedRevision < 0 || expectedRevision > 9007199254740991L) invalid("Invalid operation identity or revision")
  // Structural validation precedes replay/revision checks, without temporal eligibility checks.
  validateStoredMetadata(emptyDailyRecords().put("revision", 1).put("processedOperations", JSONArray().put(
    JSONObject().put("operationId", operationId).put("mutation", mutation).put("appliedRevision", 1)
      .apply { if (mutation.optString("type") == "delete-record") put("undoToken", "undo-$operationId") },
  )))
  val receipts = data.getJSONArray("processedOperations")
  for (i in 0 until receipts.length()) {
    val receipt = receipts.getJSONObject(i)
    if (receipt.getString("operationId") != operationId) continue
    if (canonicalJson(receipt.getJSONObject("mutation")) != canonicalJson(mutation)) invalid("Operation ID reused with different content")
    return JSONObject().put("success", true).put("appliedRevision", receipt.getLong("appliedRevision")).put("replayed", true)
      .apply { if (receipt.has("undoToken")) put("undoToken", receipt.getString("undoToken")) }
  }
  if (data.getLong("revision") != expectedRevision) throw RecordsFailure("conflict", "The record snapshot has changed")
  if (expectedRevision >= 9007199254740991L) throw RecordsFailure("unavailable", "Revision exhausted")
  val revision = expectedRevision + 1
  var undo: String? = null
  val today = LocalDate.now(clock).toString()
  fun date(value: JSONObject): String = strictDate(value).also { if (it > today) invalid("Future record date") }
  fun upsert(key: String, record: JSONObject, identity: String) {
    val array = data.getJSONArray(key)
    val identityKey = if (key in listOf("weights", "water")) "date" else "id"
    var position = -1
    for (i in 0 until array.length()) if (array.getJSONObject(i).getString(identityKey) == identity) {
      if (!owned(array.getJSONObject(i))) throw RecordsFailure("not-authorized", "External records are read-only")
      position = i; break
    }
    if (position < 0) array.put(record) else array.put(position, record)
    if (key in listOf("weights", "water")) data.put(key, JSONArray((0 until array.length()).map { array.getJSONObject(it) }.sortedBy { it.getString("date") }))
  }
  fun saveDay(request: JSONObject, weight: Boolean) {
      val kind = if (weight) "weight" else "water"
      val key = if (weight) "weights" else "water"
      val day = date(request)
      val valueKey = if (weight) "weightKg" else "amountMl"
      val value = if (weight) strictNumber(request, valueKey, 20.0, 300.0) else strictNumber(request, valueKey)
      val array = data.getJSONArray(key)
      val records = (0 until array.length()).map { array.getJSONObject(it) }
      val explicitId = if (request.has("id")) strictId(request, "id") else null
      val existing = if (explicitId != null) records.find { it.getString("id") == explicitId }
        ?: throw RecordsFailure("invalid-request", "Record not found") else records.find { it.getString("date") == day }
      if (explicitId != null && existing != null && !owned(existing)) throw RecordsFailure("not-authorized", "External records are read-only")
      if (explicitId != null && records.any { it.getString("date") == day && it.getString("id") != explicitId }) throw RecordsFailure("conflict", "Record date is occupied")
      var id = if (existing != null && owned(existing)) existing.getString("id") else "$kind-$day"
      if (records.any { it.getString("id") == id && it !== existing }) id += "-$operationId"
      val replacement = (if (existing != null && owned(existing)) JSONObject(existing.toString()) else JSONObject()).put("id", id).put("date", day).put(valueKey, value)
      val remaining = records.filter { it !== existing }
      data.put(key, JSONArray((remaining + replacement).sortedBy { it.getString("date") }))
      if (remaining.any { it.getString("id") == id }) throw RecordsFailure("conflict", "Record ID is occupied")
  }
  when (strictString(mutation, "type")) {
    "save-profile" -> {
      validateProfileMutation(mutation, data, clock)
      for (key in listOf("profile", "goalWeightKg", "weeklyLossKg", "guidanceMode", "safetyFlags")) data.put(key, mutation.get(key))
      if (mutation.has("initialWeightKg")) saveDay(JSONObject().put("date", today).put("weightKg", mutation.getDouble("initialWeightKg")), true)
      data.put("setupCompleted", true)
    }
    "set-weight", "set-water" -> saveDay(mutation, mutation.getString("type") == "set-weight")
    "save-legacy-intake" -> {
      val sample = JSONObject((mutation.optJSONObject("sample") ?: invalid("Invalid legacy sample")).toString())
      val id = strictString(sample, "id"); date(sample); validateNutrients(sample)
      val array = data.getJSONArray("legacyIntake")
      val records = (0 until array.length()).map { array.getJSONObject(it) }
      val previous = records.find { it.getString("id") == id } ?: throw RecordsFailure("not-found", "Legacy aggregate not found")
      if (!owned(previous) || !owned(sample)) throw RecordsFailure("not-authorized", "External aggregate is read-only")
      if (previous.getString("date") != sample.getString("date") && records.any { it !== previous && it.getString("date") == sample.getString("date") }) throw RecordsFailure("conflict", "Legacy date is occupied")
      // An edit keeps metadata the historical aggregate already carried.
      val replacement = JSONObject(previous.toString())
      for (key in listOf("date", "kcal", "macros", "micros")) replacement.put(key, sample.get(key))
      data.put("legacyIntake", JSONArray(records.map { if (it === previous) replacement else it }))
    }
    "save-exercise", "save-intake" -> {
      val exercise = mutation.getString("type") == "save-exercise"
      val record = JSONObject((mutation.optJSONObject(if (exercise) "exercise" else "entry") ?: invalid("Invalid record")).toString())
      date(record)
      if (!owned(record)) throw RecordsFailure("not-authorized", "Cannot write external records")
      if (exercise) validateExercise(record) else validateIntakeEntry(record)
      val deleted = data.getJSONArray("deletedRecords")
      if ((0 until deleted.length()).any {
          val item = deleted.getJSONObject(it)
          item.getString("kind") == (if (exercise) "exercise" else "intake") && item.getJSONObject("record").getString("id") == record.getString("id")
        }) throw RecordsFailure("conflict", "Deleted record must be restored explicitly")
      upsert(if (exercise) "exercises" else "intakeEntries", record, record.getString("id"))
      if (!exercise && record.has("foodId")) {
        val current = data.getJSONArray("recentFoodIds")
        val ids = listOf(record.getString("foodId")) + (0 until current.length()).map { current.getString(it) }
        data.put("recentFoodIds", JSONArray(ids.distinct().take(12)))
      }
    }
    "delete-record" -> {
      val kind = strictString(mutation, "kind"); val id = strictString(mutation, "id")
      val key = when (kind) { "weight" -> "weights"; "water" -> "water"; "exercise" -> "exercises"; "intake" -> "intakeEntries"; "legacy-intake" -> "legacyIntake"; else -> invalid("Invalid record kind") }
      val records = data.getJSONArray(key)
      var deleted: JSONObject? = null
      val remaining = JSONArray()
      for (i in 0 until records.length()) {
        val record = records.getJSONObject(i)
        val recordId = record.getString("id")
        if (recordId == id) {
          if (!owned(record)) throw RecordsFailure("not-authorized", "External records are read-only")
          deleted = JSONObject(record.toString()).put("id", recordId)
        } else remaining.put(record)
      }
      if (deleted == null) throw RecordsFailure("not-found", "Record not found")
      data.put(key, remaining)
      undo = "undo-$operationId"
      data.getJSONArray("deletedRecords").put(JSONObject().put("token", undo).put("kind", kind).put("record", deleted)
        .put("deletedAt", Instant.now(clock).toString()).put("deletedRevision", revision))
    }
    "restore-record" -> {
      val token = strictString(mutation, "token")
      val trash = data.getJSONArray("deletedRecords")
      val tombstone = (0 until trash.length()).map { trash.getJSONObject(it) }.find { it.getString("token") == token } ?: invalid("Unknown restore token")
      val kind = tombstone.getString("kind"); val record = tombstone.getJSONObject("record")
      val key = when (kind) { "weight" -> "weights"; "water" -> "water"; "exercise" -> "exercises"; "intake" -> "intakeEntries"; "legacy-intake" -> "legacyIntake"; else -> invalid("Invalid deleted record") }
      val existing = data.getJSONArray(key)
      val identityKey = if (kind in listOf("weight", "water")) "date" else "id"
      if ((0 until existing.length()).any { existing.getJSONObject(it).getString("id") == record.getString("id") || existing.getJSONObject(it).getString(identityKey) == record.getString(identityKey) }) throw RecordsFailure("conflict", "Restore target is occupied")
      upsert(key, JSONObject(record.toString()), record.getString(identityKey))
      data.put("deletedRecords", JSONArray((0 until trash.length()).map { trash.getJSONObject(it) }.filter { it.getString("token") != token }))
    }
    else -> invalid("Unsupported mutation")
  }
  projectDailyIntake(data)
  data.put("revision", revision)
  val receipt = JSONObject().put("operationId", operationId).put("mutation", JSONObject(mutation.toString())).put("appliedRevision", revision)
  if (undo != null) receipt.put("undoToken", undo)
  receipts.put(receipt)
  return JSONObject().put("success", true).put("appliedRevision", revision).put("replayed", false).apply { if (undo != null) put("undoToken", undo) }
}
