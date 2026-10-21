package com.zzzode.leanon.companion

import com.zzzode.leanon.data.projectDailyIntake
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.UUID

/** Per-entity clocks prevent an unrelated edit from resurrecting a stale profile or meal. */
internal object CompanionVaultMerge {
  private val recordLists = listOf("weights", "water", "exercises", "legacyIntake", "intakeEntries")
  private val recordScalars = listOf("setupCompleted", "profile", "goalWeightKg", "weeklyLossKg", "guidanceMode", "safetyFlags")
  fun canonical(value: Any?): String = when (value) {
    null, JSONObject.NULL -> "null"
    is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(",", "{", "}") { JSONObject.quote(it) + ":" + canonical(value.get(it)) }
    is JSONArray -> (0 until value.length()).joinToString(",", "[", "]") { canonical(value.get(it)) }
    is String -> JSONObject.quote(value)
    is Number -> if (value.toDouble() == 0.0) "0" else JSONObject.numberToString(value)
    else -> value.toString()
  }
  private fun rows(array: JSONArray, field: String = "id"): Map<String, JSONObject> {
    val result = linkedMapOf<String, JSONObject>()
    for (i in 0 until array.length()) { val row = array.getJSONObject(i); val id = row.getString(field); if (result.put(id, row) != null) throw IOException("Duplicate sync entity") }
    return result
  }
  private fun entities(payload: JSONObject): Map<String, Any> {
    val result = linkedMapOf<String, Any>(); val records = payload.getJSONObject("records"); val personal = payload.getJSONObject("personal")
    result["profile"] = JSONObject().apply { for (field in recordScalars) put(field, records.get(field)) }
    val scopes = mapOf("weights" to "weight", "water" to "water", "exercises" to "exercise", "legacyIntake" to "legacy-intake", "intakeEntries" to "intake")
    for ((field, scope) in scopes) for ((id, row) in rows(records.getJSONArray(field))) result["$scope:$id"] = row
    for ((id, row) in rows(payload.getJSONArray("customFoods"))) result["custom-food:$id"] = row
    for ((id, row) in rows(personal.getJSONArray("measurements"))) result["measurement:$id"] = row
    val photoBytes = rows(payload.getJSONArray("photos"))
    for ((id, row) in rows(personal.getJSONArray("photos"))) result["photo:$id"] = JSONObject().put("metadata", row).put("bytes", photoBytes[id] ?: throw IOException("Missing photo bytes"))
    result["preferences"] = personal.getJSONObject("dietaryPreferences")
    result["favorites"] = payload.getJSONArray("favoriteFoodIds")
    result["recent"] = payload.getJSONArray("recentFoodIds")
    return result
  }
  private fun validClock(clock: JSONObject): Triple<Long, String, String> {
    if (clock.length() != 3) throw IOException("Invalid entity clock")
    val raw = clock.opt("updatedAt") as? Number ?: throw IOException("Invalid entity clock")
    val value = raw.toDouble(); if (!value.isFinite() || value < 0 || value > 9007199254740991.0 || value % 1.0 != 0.0) throw IOException("Invalid entity clock")
    fun identifier(key: String): String = (clock.opt(key) as? String)?.takeIf { it.matches(Regex("[A-Za-z0-9_-]{1,128}")) } ?: throw IOException("Invalid entity clock")
    return Triple(value.toLong(), identifier("deviceId"), identifier("id"))
  }
  private fun compare(a: JSONObject?, b: JSONObject?): Int {
    if (a == null) return if (b == null) 0 else -1
    if (b == null) return 1
    val x = validClock(a); val y = validClock(b)
    return x.first.compareTo(y.first).takeIf { it != 0 } ?: x.second.compareTo(y.second).takeIf { it != 0 } ?: x.third.compareTo(y.third)
  }
  fun metadata(envelope: JSONObject): JSONObject {
    validateEnvelope(envelope)
    val hashes = JSONObject(); for ((key, value) in entities(envelope.getJSONObject("payload"))) hashes.put(key, CompanionCrypto.hash(canonical(value).toByteArray()))
    return JSONObject().put("clocks", JSONObject(envelope.getJSONObject("clocks").toString())).put("hashes", hashes)
      .put("tombstones", JSONObject(envelope.getJSONObject("tombstones").toString()))
  }
  fun prepare(payload: JSONObject, prior: JSONObject?, deviceId: String, now: Long): JSONObject {
    val clocks = JSONObject(prior?.optJSONObject("clocks")?.toString() ?: "{}")
    val hashes = prior?.optJSONObject("hashes") ?: JSONObject()
    val current = entities(payload); var stamp = maxOf(now, clocks.keys().asSequence().map { validClock(clocks.getJSONObject(it)).first }.maxOrNull() ?: 0)
    val foods = linkedSetOf<String>(); prior?.optJSONObject("tombstones")?.optJSONArray("customFoods")?.let { for (i in 0 until it.length()) foods.add(it.getString(i)) }
    for (key in hashes.keys()) if (key.startsWith("custom-food:") && key !in current) foods.add(key.removePrefix("custom-food:"))
    val all = (current.keys + hashes.keys().asSequence().toList()).toSet()
    for (key in all) {
      val digest = CompanionCrypto.hash(canonical(current[key]).toByteArray())
      if (!clocks.has(key) || hashes.optString(key) != digest) {
        val records = payload.getJSONObject("records"); val personal = payload.getJSONObject("personal")
        fun hasMutation(list: JSONArray, type: String) = (0 until list.length()).any { list.getJSONObject(it).getJSONObject("mutation").optString("type") == type }
        val unset = when (key) {
          "profile" -> records.isNull("profile") && !records.getBoolean("setupCompleted") && !hasMutation(records.getJSONArray("processedOperations"), "save-profile")
          "preferences" -> canonical(personal.getJSONObject("dietaryPreferences")) == canonical(JSONObject().put("pattern", "none").put("excludedFoodIds", JSONArray()).put("notes", "")) && !hasMutation(personal.getJSONArray("processedOperations"), "set-dietary-preferences")
          "favorites" -> payload.getJSONArray("favoriteFoodIds").length() == 0
          "recent" -> payload.getJSONArray("recentFoodIds").length() == 0
          else -> false
        }
        val firstUnset = !clocks.has(key) && unset
        if (!firstUnset) { if (stamp >= 9007199254740991L) throw IOException("Sync clock limit reached"); stamp += 1 }
        clocks.put(key, JSONObject().put("updatedAt", if (firstUnset) 0 else stamp).put("deviceId", deviceId).put("id", UUID.randomUUID().toString()))
      }
    }
    return JSONObject().put("version", 1).put("kind", "vault-snapshot").put("payload", JSONObject(payload.toString()))
      .put("clocks", clocks).put("tombstones", JSONObject().put("customFoods", JSONArray(foods.sorted())))
  }
  fun validateEnvelope(value: JSONObject) {
    if (value.length() != 5 || value.opt("version") !is Number || value.getDouble("version") != 1.0 || value.optString("kind") != "vault-snapshot") throw IOException("Invalid vault snapshot")
    val payload = value.getJSONObject("payload"); val clocks = value.getJSONObject("clocks")
    com.zzzode.leanon.personal.BackupCodec.validate(payload)
    for (key in clocks.keys()) validClock(clocks.getJSONObject(key))
    for (key in entities(payload).keys) if (!clocks.has(key)) throw IOException("Missing entity clock")
    val tombstones = value.getJSONObject("tombstones"); if (tombstones.length() != 1) throw IOException("Invalid sync tombstones")
    val deleted = tombstones.getJSONArray("customFoods"); val ids = mutableSetOf<String>(); if (deleted.length() > 10000) throw IOException("Sync tombstone limit reached")
    for (i in 0 until deleted.length()) if (!deleted.getString(i).matches(Regex("[A-Za-z0-9_-]{1,128}")) || !ids.add(deleted.getString(i))) throw IOException("Duplicate sync tombstone")
  }
  private fun unionReceipts(a: JSONArray, b: JSONArray): JSONArray {
    val output = rows(a, "operationId").toMutableMap()
    for ((id, row) in rows(b, "operationId")) {
      val old = output[id]
      if (old != null && canonical(old) != canonical(row)) throw IOException("Conflicting operation receipt")
      if (old == null || row.getLong("appliedRevision") > old.getLong("appliedRevision")) output[id] = row
    }
    return JSONArray(output.toSortedMap().values.toList())
  }
  fun merge(current: JSONObject, incoming: JSONObject): JSONObject {
    validateEnvelope(current); validateEnvelope(incoming)
    val a = current.getJSONObject("payload"); val b = incoming.getJSONObject("payload"); val output = JSONObject(a.toString())
    val ac = current.getJSONObject("clocks"); val bc = incoming.getJSONObject("clocks"); val clocks = JSONObject(ac.toString())
    for (key in bc.keys()) if (compare(ac.optJSONObject(key), bc.getJSONObject(key)) < 0) clocks.put(key, bc.getJSONObject(key))
    fun select(key: String, av: Any?, bv: Any?): Any? {
      val order = compare(ac.optJSONObject(key), bc.optJSONObject(key))
      if (order == 0 && av != null && bv != null && canonical(av) != canonical(bv)) throw IOException("Conflicting entity identity")
      return if (order < 0) bv else av
    }
    fun mergeRows(scope: String, aa: JSONArray, bb: JSONArray, byDate: Boolean = false): JSONArray {
      val chosen = linkedMapOf<String, Pair<JSONObject, JSONObject>>()
      for ((list, env) in listOf(aa to current, bb to incoming)) for ((id, row) in rows(list)) {
        val stamp = env.getJSONObject("clocks").getJSONObject("$scope:$id")
        val identity = if (byDate) row.getString("date") else id
        val previous = chosen[identity]; val order = if (previous == null) 1 else compare(stamp, previous.second)
        if (previous != null && order == 0 && canonical(previous.first) != canonical(row)) throw IOException("Conflicting entity identity")
        if (order > 0) chosen[identity] = row to stamp
      }
      return JSONArray(chosen.values.map { it.first }.sortedBy { it.getString("id") })
    }
    val records = output.getJSONObject("records"); val br = b.getJSONObject("records")
    val profile = select("profile", JSONObject().apply { for (field in recordScalars) put(field, records.get(field)) }, JSONObject().apply { for (field in recordScalars) put(field, br.get(field)) }) as JSONObject
    for (field in recordScalars) records.put(field, profile.get(field))
    val scopes = mapOf("weights" to "weight", "water" to "water", "exercises" to "exercise", "legacyIntake" to "legacy-intake", "intakeEntries" to "intake")
    records.put("processedOperations", unionReceipts(records.getJSONArray("processedOperations"), br.getJSONArray("processedOperations")))
    val deleted = rows(records.getJSONArray("deletedRecords"), "token").toMutableMap()
    for ((token, row) in rows(br.getJSONArray("deletedRecords"), "token")) { if (deleted[token] != null && canonical(deleted[token]) != canonical(row)) throw IOException("Conflicting deletion token"); deleted[token] = row }
    val receipts = records.getJSONArray("processedOperations"); val restored = mutableSetOf<String>()
    for (i in 0 until receipts.length()) { val mutation = receipts.getJSONObject(i).getJSONObject("mutation"); if (mutation.optString("type") == "restore-record") restored.add(mutation.getString("token")) }
    for (token in restored) deleted.remove(token)
    records.put("deletedRecords", JSONArray(deleted.toSortedMap().values.toList()))
    val kindLists = mapOf("weight" to "weights", "water" to "water", "exercise" to "exercises", "intake" to "intakeEntries", "legacy-intake" to "legacyIntake")
    for ((kind, field) in kindLists) {
      val ids = deleted.values.filter { it.optString("kind") == kind }.map { it.getJSONObject("record").getString("id") }.toSet()
      fun live(list: JSONArray) = JSONArray((0 until list.length()).map { list.getJSONObject(it) }.filter { it.getString("id") !in ids })
      records.put(field, mergeRows(kind, live(a.getJSONObject("records").getJSONArray(field)), live(br.getJSONArray(field)), field in listOf("weights", "water")))
    }
    val personal = output.getJSONObject("personal"); val bp = b.getJSONObject("personal")
    personal.put("dietaryPreferences", select("preferences", personal.getJSONObject("dietaryPreferences"), bp.getJSONObject("dietaryPreferences")))
    personal.put("processedOperations", unionReceipts(personal.getJSONArray("processedOperations"), bp.getJSONArray("processedOperations")))
    val personalDeleted = mutableMapOf("photos" to mutableSetOf<String>(), "measurements" to mutableSetOf<String>())
    val pr = personal.getJSONArray("processedOperations")
    for (i in 0 until pr.length()) { val mutation = pr.getJSONObject(i).getJSONObject("mutation"); when (mutation.optString("type")) { "delete-photo" -> personalDeleted.getValue("photos").add(mutation.getString("id")); "delete-measurement" -> personalDeleted.getValue("measurements").add(mutation.getString("id")) } }
    for (field in listOf("measurements", "photos")) {
      val ids = personalDeleted.getValue(field)
      fun live(list: JSONArray) = JSONArray((0 until list.length()).map { list.getJSONObject(it) }.filter { it.getString("id") !in ids })
      personal.put(field, mergeRows(if (field == "photos") "photo" else "measurement", live(personal.getJSONArray(field)), live(bp.getJSONArray(field))))
    }
    val foodDeletes = linkedSetOf<String>()
    for (env in listOf(current, incoming)) { val list = env.getJSONObject("tombstones").getJSONArray("customFoods"); for (i in 0 until list.length()) foodDeletes.add(list.getString(i)) }
    fun liveFoods(list: JSONArray) = JSONArray(rows(list).values.filter { it.getString("id") !in foodDeletes })
    val foodRows = mergeRows("custom-food", liveFoods(a.getJSONArray("customFoods")), liveFoods(b.getJSONArray("customFoods")))
    output.put("customFoods", JSONArray((0 until foodRows.length()).map { foodRows.getJSONObject(it) }.filter { it.getString("id") !in foodDeletes }))
    output.put("favoriteFoodIds", select("favorites", a.getJSONArray("favoriteFoodIds"), b.getJSONArray("favoriteFoodIds")))
    output.put("recentFoodIds", select("recent", a.getJSONArray("recentFoodIds"), b.getJSONArray("recentFoodIds")))
    val retainedPhotos = personal.getJSONArray("photos"); val photoIds = (0 until retainedPhotos.length()).map { retainedPhotos.getJSONObject(it).getString("id") }.toSet()
    fun livePhotos(list: JSONArray) = JSONArray(rows(list).values.filter { it.getString("id") in photoIds })
    val photoRows = mergeRows("photo", livePhotos(a.getJSONArray("photos")), livePhotos(b.getJSONArray("photos")))
    output.put("photos", JSONArray((0 until photoRows.length()).map { photoRows.getJSONObject(it) }.filter { it.getString("id") in photoIds }))
    projectDailyIntake(records)
    fun comparable(payload: JSONObject): String = canonical(JSONObject(payload.toString()).apply { put("createdAt", "2000-01-01T00:00:00Z"); getJSONObject("records").put("revision", 0); getJSONObject("personal").put("revision", 0) })
    if (comparable(output) != comparable(a)) {
      val rr = maxOf(a.getJSONObject("records").getLong("revision"), br.getLong("revision"))
      val pr = maxOf(a.getJSONObject("personal").getLong("revision"), bp.getLong("revision"))
      if (rr >= 9007199254740991L || pr >= 9007199254740991L) throw IOException("Revision limit reached")
      records.put("revision", rr + 1); personal.put("revision", pr + 1)
    }
    com.zzzode.leanon.personal.BackupCodec.validate(output)
    return JSONObject().put("version", 1).put("kind", "vault-snapshot").put("payload", output).put("clocks", clocks).put("tombstones", JSONObject().put("customFoods", JSONArray(foodDeletes.sorted())))
  }
}
