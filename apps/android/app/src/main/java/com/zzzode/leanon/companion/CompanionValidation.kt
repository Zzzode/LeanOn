package com.zzzode.leanon.companion

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.time.LocalDate

internal object CompanionValidation {
  fun session(value: JSONObject) {
    for (field in listOf("accountId", "deviceId", "vaultId")) id(value.opt(field))
    val token = value.opt("token") as? String ?: throw IOException("Invalid session token")
    if (!token.matches(Regex("[A-Za-z0-9_-]{43}"))) throw IOException("Invalid session token")
    val tokenBytes = java.util.Base64.getUrlDecoder().decode(token); if (tokenBytes.size != 32 || java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes) != token) throw IOException("Invalid session token"); tokenBytes.fill(0)
    integer(value.opt("expiresAt"))
    if (value.opt("deviceAuthorized") !is Boolean) throw IOException("Invalid device authorization")
  }
  fun state(value: JSONObject) {
    if (value.opt("version") !is Number || value.getDouble("version") != 1.0) throw IOException("Unsupported companion state")
    id(value.opt("deviceId")); CompanionCrypto.decode(value.opt("deviceProof"), 32).fill(0)
    for (field in listOf("endpoint", "localDataAccountId", "localDataRealm", "lastSyncAt", "errorCode"))
      if (value.opt(field) !== JSONObject.NULL && value.opt(field) !is String) throw IOException("Invalid companion state")
    if (!value.isNull("endpoint")) CompanionHttp.validateEndpoint(value.getString("endpoint"))
    if (!value.isNull("session")) session(value.getJSONObject("session"))
    for (field in listOf("localConsent", "accountKeys", "vaultMetadata", "groupKeys", "invitationSecrets", "peerData", "peerPhotos", "cursors", "applied", "pendingAcks", "sentHashes"))
      if (value.opt(field) !is JSONObject) throw IOException("Invalid companion state")
    for (field in listOf("invitations", "messages", "outbox")) if (value.opt(field) !is JSONArray) throw IOException("Invalid companion state")
    if (value.getJSONArray("messages").length() > 1000 || value.getJSONArray("invitations").length() > 1000 || value.getJSONArray("outbox").length() > 1000) throw IOException("Companion state exceeds supported size")
    if (!value.isNull("family")) group(value.getJSONObject("family"))
    for (field in listOf("accountKeys", "groupKeys")) for (key in value.getJSONObject(field).keys()) CompanionCrypto.decode(value.getJSONObject(field).opt(key), 32).fill(0)
    for (key in value.getJSONObject("cursors").keys()) integer(value.getJSONObject("cursors").opt(key))
    val pending = value.opt("pendingAccountDeletion")
    if (pending != null && pending !== JSONObject.NULL) {
      val intent = pending as? JSONObject ?: throw IOException("Invalid deletion intent")
      exact(intent, setOf("version", "operationId", "proof", "endpoint", "accountId", "displayName", "login", "deleteLocalData", "expectedRecordsRevision", "expectedPersonalRevision", "phase", "localDataCleared"))
      if (integer(intent.opt("version")) != 1L) throw IOException("Invalid deletion intent")
      id(intent.opt("operationId")); id(intent.opt("accountId")); CompanionCrypto.decode(intent.opt("proof"), 32).fill(0)
      CompanionHttp.validateEndpoint(string(intent.opt("endpoint"), 2048))
      val login = string(intent.opt("login"), 128); if (login.length < 3 || login != login.trim().lowercase(java.util.Locale.ROOT)) throw IOException("Invalid deletion login")
      if (string(intent.opt("displayName"), 100).trim().isEmpty()) throw IOException("Invalid deletion name")
      if (intent.opt("deleteLocalData") !is Boolean || intent.opt("localDataCleared") !is Boolean || intent.opt("phase") !in listOf("prepared", "confirmed", "local-complete")) throw IOException("Invalid deletion intent")
      if (intent.getBoolean("localDataCleared") && intent.getString("phase") == "prepared") throw IOException("Deletion was not confirmed")
      integer(intent.opt("expectedRecordsRevision")); integer(intent.opt("expectedPersonalRevision"))
    }
  }
  private fun exact(value: JSONObject, fields: Set<String>) { if (value.keys().asSequence().toSet() != fields) throw IOException("Unexpected deletion fields") }
  fun deletionReceipt(value: JSONObject, operationId: String, accountId: String) {
    exact(value, setOf("version", "operationId", "accountId", "status", "deletedAt"))
    if (integer(value.opt("version")) != 1L || value.opt("operationId") != operationId || value.opt("accountId") != accountId || value.opt("status") != "deleted") throw IOException("Unexpected deletion receipt")
    integer(value.opt("deletedAt"))
  }
  fun deletionAcknowledgement(value: JSONObject, operationId: String) {
    exact(value, setOf("version", "operationId", "status"))
    if (integer(value.opt("version")) != 1L || value.opt("operationId") != operationId || value.opt("status") != "acknowledged") throw IOException("Unexpected deletion acknowledgement")
  }
  fun integer(value: Any?): Long {
    val raw = value as? Number ?: throw IOException("Invalid relay integer")
    val number = raw.toDouble(); if (!number.isFinite() || number < 0 || number > 9007199254740991.0 || number % 1.0 != 0.0) throw IOException("Invalid relay integer")
    return number.toLong()
  }
  private fun id(value: Any?): String = (value as? String)?.takeIf { it.matches(Regex("[A-Za-z0-9_-]{1,128}")) } ?: throw IOException("Invalid relay identity")
  private fun array(value: Any?): JSONArray = value as? JSONArray ?: throw IOException("Invalid shared array")
  private fun string(value: Any?, maximum: Int = 2000): String = (value as? String)?.takeIf { it.length <= maximum } ?: throw IOException("Invalid shared string")
  private fun numeric(value: Any?, minimum: Double, maximum: Double): Double = ((value as? Number)?.toDouble())?.takeIf { it.isFinite() && it in minimum..maximum } ?: throw IOException("Invalid shared number")
  private fun date(value: Any?) {
    val text = string(value, 10)
    if (!text.matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}")) || LocalDate.parse(text).toString() != text) throw IOException("Invalid shared date")
  }
  fun group(value: JSONObject) {
    id(value.opt("id")); if (value.opt("kind") !in listOf("vault", "family") || integer(value.opt("epoch")) < 1) throw IOException("Invalid relay group")
    val members = array(value.opt("members")); val ids = (0 until members.length()).map { id(members.get(it)) }
    if (ids.toSet().size != ids.size || ids.size != if (value.getString("kind") == "vault") 1 else 2) throw IOException("Invalid group membership")
    val grants = value.optJSONObject("grants") ?: throw IOException("Invalid sharing grants")
    for (sender in grants.keys()) { if (sender !in ids) throw IOException("Invalid grant sender"); val targets = grants.getJSONObject(sender)
      for (recipient in targets.keys()) { if (recipient !in ids || recipient == sender) throw IOException("Invalid grant recipient"); val list = array(targets.opt(recipient)); val categories = (0 until list.length()).map { string(list.get(it), 128) }; if (categories.toSet().size != categories.size || categories.any { it !in CompanionRepository.CATEGORIES }) throw IOException("Invalid sharing categories") }
    }
  }
  fun category(category: String, data: Any) {
    when (category) {
      "goal" -> { val value = data as? JSONObject ?: throw IOException("Invalid shared goal"); if (value.keys().asSequence().any { it !in listOf("guidanceMode", "weeklyLossKg") } || value.opt("guidanceMode") !in listOf("weight-loss", "tracking-only")) throw IOException("Invalid shared goal"); if (value.has("weeklyLossKg")) numeric(value.opt("weeklyLossKg"), 0.0, 1.0) }
      "progress_band" -> if (data !in listOf("steady", "changing", "maintaining", "insufficient-data")) throw IOException("Invalid shared progress")
      "checkin_streak" -> if (integer(data) > 100000) throw IOException("Invalid shared streak")
      "exact_weight" -> numeric(data, 20.0, 300.0)
      "meals" -> { val rows = array(data); if (rows.length() > 1000) throw IOException("Shared meals exceed supported size"); for (i in 0 until rows.length()) { val row = rows.getJSONObject(i); if (row.length() != 3) throw IOException("Invalid shared meal"); date(row.opt("date")); string(row.opt("name"), 1000); numeric(row.opt("kcal"), 0.0, 1000000.0) } }
      "photos" -> { val rows = array(data); if (rows.length() > 1000) throw IOException("Shared photos exceed supported size"); val ids = mutableSetOf<String>(); for (i in 0 until rows.length()) { val row = rows.getJSONObject(i); com.zzzode.leanon.personal.validateProgressPhoto(row); if (!ids.add(row.getString("id"))) throw IOException("Duplicate shared photo") } }
      "body_measurements" -> { val rows = array(data); if (rows.length() > 100000) throw IOException("Shared measurements exceed supported size"); val ids = mutableSetOf<String>(); for (i in 0 until rows.length()) { val row = rows.getJSONObject(i); com.zzzode.leanon.personal.validateMeasurement(row); if (!ids.add(row.getString("id"))) throw IOException("Duplicate shared measurement") } }
      "menstrual" -> { val rows = array(data); if (rows.length() > 1000) throw IOException("Shared records exceed supported size"); for (i in 0 until rows.length()) { val row = rows.getJSONObject(i); if (row.keys().asSequence().any { it !in listOf("startDate", "cycleLengthDays") }) throw IOException("Invalid shared menstrual record"); date(row.opt("startDate")); if (row.has("cycleLengthDays")) numeric(row.opt("cycleLengthDays"), 1.0, 365.0) } }
      else -> throw IOException("Unknown shared category")
    }
  }
}
