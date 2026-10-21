package com.zzzode.leanon.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.time.Clock
import com.zzzode.leanon.personal.EncryptedRecordsCodec

/**
 * App-private JSON record store. The native side is the persistence authority
 * (RFC 0010). On first launch an empty schema-2 store is created; each
 * write upserts the weight for a date and returns the full HostData snapshot.
 *
 * Normal app writes are encrypted under RFC 0008. Existing plaintext is read
 * compatibly and migrates only with the next explicit successful write.
 */
/**
 * An exercise session mirrored from Health Connect (RFC 0025). It lives in the
 * data package so the healthconnect layer can build it without a reverse
 * dependency; `source` is implied to be 'health_connect'.
 */
data class ExternalExercise(
  val id: String,
  val date: String,
  val typeId: String,
  val durationMin: Double,
  val kcal: Double,
)

class RecordsRepository internal constructor(
  private val recordFile: File,
  private val seed: () -> String,
  private val persist: (File, String) -> Unit = ::writeRecordsAtomically,
  private val clock: () -> Clock = { Clock.systemDefaultZone() },
) {
  private var readStored: (File) -> String = { it.readText(Charsets.UTF_8) }
  private var encodeStored: (String) -> String = { it }
  internal var eraseStorageKeys: () -> Unit = {}
  internal var eraseDerivedStorageKeys: () -> Unit = {}
  internal var availabilityCheck: () -> Unit = {}
  internal val storageFile: File get() = recordFile
  @Synchronized internal fun prepareReplacement(data: JSONObject): ByteArray = encodeStored(migrateDailyRecords(data, clock()).toString()).toByteArray(Charsets.UTF_8)
  constructor(context: Context, clock: () -> Clock = { Clock.systemDefaultZone() }) : this(context, clock, EncryptedRecordsCodec(context))

  private constructor(context: Context, clock: () -> Clock, codec: EncryptedRecordsCodec) : this(
    File(context.applicationContext.filesDir, RECORD_FILE),
    { emptyDailyRecords().toString() },
    persist = codec::write,
    clock = clock,
  ) {
    readStored = codec::read; encodeStored = codec::encode; eraseStorageKeys = codec::eraseKeys
    eraseDerivedStorageKeys = { com.zzzode.leanon.personal.PersonalKeyStore(context,
      File(context.filesDir, "health-connect-ledger-key-v1"), "health-connect-ledger").delete() }
  }

  /** Read a projected schema-2 snapshot; migration commits only with a successful write. */
  @Synchronized
  fun loadHostData(): JSONObject {
    availabilityCheck()
    val original = if (recordFile.exists()) readStored(recordFile) else seed()
    val data = JSONObject(original)
    if (data.optInt("schemaVersion", 1) != 2) { ensureExerciseIds(data); ensureMicros(data) }
    val upgraded = migrateDailyRecords(data, clock())
    return upgraded
  }

  /** Current local date/hour and a check-in streak; persisted seed metadata is not authoritative. */
  @Synchronized
  fun currentSnapshot(): JSONObject = currentSnapshot(loadHostData(), clock())

  /** A zeroed micronutrients object (RFC 0024). */
  private fun zeroMicros(): JSONObject =
    JSONObject()
      .put(FIBER_G, 0.0)
      .put(SUGAR_G, 0.0)
      .put(SATURATED_FAT_G, 0.0)
      .put(SODIUM_MG, 0.0)

  /**
   * Backfill missing micronutrients on intake samples and user foods (RFC 0024),
   * mirroring the exercise-id migration. Returns true when the data changed.
   */
  private fun ensureMicros(data: JSONObject): Boolean {
    var changed = false
    for (key in listOf(INTAKE, "legacyIntake", CUSTOM_FOODS)) {
      val array = data.optJSONArray(key) ?: continue
      for (index in 0 until array.length()) {
        val record = array.optJSONObject(index) ?: continue
        if (!record.has(MICROS)) {
          record.put(MICROS, zeroMicros())
          changed = true
        }
      }
    }
    return changed
  }

  /**
   * Ensure every exercise session has a non-empty id (RFC 0018); create the
   * array when missing and assign ids to legacy sessions. Returns true when the
   * data was modified so the caller can persist it.
   */
  private fun ensureExerciseIds(data: JSONObject): Boolean {
    val exercises =
      data.optJSONArray(EXERCISES)
        ?: JSONArray().also { data.put(EXERCISES, it) }
    var changed = false
    for (index in 0 until exercises.length()) {
      val session = exercises.optJSONObject(index) ?: continue
      if (session.optString(ID).isBlank()) {
        session.put(ID, newExerciseId())
        changed = true
      }
    }
    return changed
  }

  private fun newExerciseId(): String =
    "ex-${UUID.randomUUID().toString().take(8)}"

  /**
   * Insert or replace the weight sample for [date], persist, and return the full
   * HostData. This slice only logs today's weight, which is always the latest
   * date, so a new sample is appended and date ordering is preserved.
   */
  @Synchronized
  fun addWeight(date: String, weightKg: Double): JSONObject {
    requireWriteDate(date)
    val data = loadHostData()
    val weights = data.getJSONArray(WEIGHTS)

    var existing = -1
    for (index in 0 until weights.length()) {
      if (weights.getJSONObject(index).getString(DATE) == date) {
        existing = index
        break
      }
    }

    val baseId = "weight-$date"
    val id = if (existing >= 0 && owned(weights.getJSONObject(existing))) weights.getJSONObject(existing).getString(ID)
      else if ((0 until weights.length()).any { it != existing && weights.getJSONObject(it).getString(ID) == baseId }) "$baseId-${UUID.randomUUID()}" else baseId
    val sample = JSONObject()
      .put(ID, id)
      .put(DATE, date)
      .put(WEIGHT_KG, weightKg)

    if (existing >= 0) {
      weights.put(existing, sample)
    } else {
      weights.put(sample)
    }

    commit(data)
    return currentSnapshot(data, clock())
  }

  /**
   * Add a meal to [date], accumulating calories and macros into the day's intake
   * sample (multiple meals add together) or creating it, then persist and return
   * the full HostData (RFC 0012).
   */
  @Synchronized
  fun addIntake(
    date: String,
    kcal: Double,
    proteinG: Double,
    carbsG: Double,
    fatG: Double,
    fiberG: Double = 0.0,
    sugarG: Double = 0.0,
    saturatedFatG: Double = 0.0,
    sodiumMg: Double = 0.0,
    foodId: String? = null,
  ): JSONObject {
    requireWriteDate(date)
    val data = loadHostData()
    val intake = data.getJSONArray("legacyIntake")

    var existing = -1
    for (index in 0 until intake.length()) {
      if (intake.getJSONObject(index).getString(DATE) == date) {
        existing = index
        break
      }
    }

    if (existing >= 0) {
      val sample = intake.getJSONObject(existing)
      sample.put(KCAL, sample.getDouble(KCAL) + kcal)
      val macros = sample.getJSONObject(MACROS)
      macros.put(PROTEIN_G, macros.getDouble(PROTEIN_G) + proteinG)
      macros.put(CARBS_G, macros.getDouble(CARBS_G) + carbsG)
      macros.put(FAT_G, macros.getDouble(FAT_G) + fatG)
      val micros = sample.getJSONObject(MICROS)
      micros.put(FIBER_G, micros.getDouble(FIBER_G) + fiberG)
      micros.put(SUGAR_G, micros.getDouble(SUGAR_G) + sugarG)
      micros.put(SATURATED_FAT_G, micros.getDouble(SATURATED_FAT_G) + saturatedFatG)
      micros.put(SODIUM_MG, micros.getDouble(SODIUM_MG) + sodiumMg)
    } else {
      val macros = JSONObject()
        .put(PROTEIN_G, proteinG)
        .put(CARBS_G, carbsG)
        .put(FAT_G, fatG)
      val micros = JSONObject()
        .put(FIBER_G, fiberG)
        .put(SUGAR_G, sugarG)
        .put(SATURATED_FAT_G, saturatedFatG)
        .put(SODIUM_MG, sodiumMg)
      val sample = JSONObject()
        .put(DATE, date)
        .put(KCAL, kcal)
        .put(MACROS, macros)
        .put(MICROS, micros)
      intake.put(sample)
    }

    if (foodId !== null) touchRecent(data, foodId)

    commit(data)
    return currentSnapshot(data, clock())
  }

  /**
   * Insert or replace the total water for [date] (RFC 0023), persist, and return
   * the full HostData. Only today's total is logged (the latest date), so a new
   * day is appended and date ordering is preserved.
   */
  @Synchronized
  fun upsertWater(date: String, amountMl: Double): JSONObject {
    requireWriteDate(date)
    val data = loadHostData()
    val water =
      data.optJSONArray(WATER)
        ?: JSONArray().also { data.put(WATER, it) }

    var existing = -1
    for (index in 0 until water.length()) {
      if (water.getJSONObject(index).getString(DATE) == date) {
        existing = index
        break
      }
    }

    val baseId = "water-$date"
    val id = if (existing >= 0) water.getJSONObject(existing).getString(ID)
      else if ((0 until water.length()).any { water.getJSONObject(it).getString(ID) == baseId }) "$baseId-${UUID.randomUUID()}" else baseId
    val sample = JSONObject()
      .put(ID, id)
      .put(DATE, date)
      .put(AMOUNT_ML, amountMl)

    if (existing >= 0) {
      water.put(existing, sample)
    } else {
      water.put(sample)
    }

    commit(data)
    return currentSnapshot(data, clock())
  }

  /**
   * Append an exercise session (RFC 0017) to `exercises`, persist, and return the
   * full HostData. Sessions are kept individually rather than merged per day.
   */
  @Synchronized
  fun addExercise(
    date: String,
    typeId: String,
    durationMin: Double,
    kcal: Double,
  ): JSONObject {
    requireWriteDate(date)
    val data = loadHostData()
    val exercises = data.getJSONArray(EXERCISES)
    val session = JSONObject()
      .put(ID, newExerciseId())
      .put(DATE, date)
      .put(TYPE_ID, typeId)
      .put(DURATION_MIN, durationMin)
      .put(KCAL, kcal)
    exercises.put(session)

    commit(data)
    return currentSnapshot(data, clock())
  }

  /** Replace a session (RFC 0018) in place, keeping its id; throw if absent. */
  @Synchronized
  fun updateExercise(
    id: String,
    date: String,
    typeId: String,
    durationMin: Double,
    kcal: Double,
  ): JSONObject {
    requireWriteDate(date)
    val data = loadHostData()
    val exercises = data.getJSONArray(EXERCISES)
    var found = false
    for (index in 0 until exercises.length()) {
      val session = exercises.getJSONObject(index)
      if (session.optString(ID) == id) {
        if (!owned(session)) throw RecordsFailure("not-authorized", "External exercise is read-only")
        session
          .put(DATE, date)
          .put(TYPE_ID, typeId)
          .put(DURATION_MIN, durationMin)
          .put(KCAL, kcal)
        found = true
        break
      }
    }
    if (!found) {
      throw NoSuchElementException("Exercise session not found: $id")
    }

    commit(data)
    return currentSnapshot(data, clock())
  }

  /** Remove a session (RFC 0018); throw if the id is absent. */
  @Synchronized
  fun deleteExercise(id: String): JSONObject {
    val data = loadHostData()
    val existing = data.getJSONArray(EXERCISES)
    val updated = JSONArray()
    var found = false
    for (index in 0 until existing.length()) {
      val session = existing.getJSONObject(index)
      if (session.optString(ID) == id) {
        if (!owned(session)) throw RecordsFailure("not-authorized", "External exercise is read-only")
        found = true
      } else {
        updated.put(session)
      }
    }
    if (!found) {
      throw NoSuchElementException("Exercise session not found: $id")
    }
    data.put(EXERCISES, updated)

    commit(data)
    return currentSnapshot(data, clock())
  }

  /**
   * Rebuild the Health Connect weight mirrors (RFC 0025): keep every LeanOn-
   * owned sample, drop previous mirrors, then add one mirror per external date
   * LeanOn did not log. Weights are sorted by date and persisted.
   */
  @Synchronized
  fun replaceExternalWeights(weightsByDate: Map<String, Double>): JSONObject {
    val data = loadHostData()
    val weights = data.getJSONArray(WEIGHTS)
    val ownedDates = HashSet<String>()
    val samples = ArrayList<JSONObject>()
    for (index in 0 until weights.length()) {
      val sample = weights.getJSONObject(index)
      if (sample.optString(SOURCE) == HEALTH_CONNECT) continue
      samples.add(sample)
      ownedDates.add(sample.getString(DATE))
    }
    for ((date, kg) in weightsByDate) {
      if (ownedDates.contains(date)) continue
      samples.add(
        JSONObject()
          .put(ID, if (samples.any { it.getString(ID) == "hc-weight-$date" }) "hc-weight-$date-${UUID.randomUUID()}" else "hc-weight-$date")
          .put(DATE, date)
          .put(WEIGHT_KG, kg)
          .put(SOURCE, HEALTH_CONNECT),
      )
    }
    samples.sortBy { it.getString(DATE) }
    val rebuilt = JSONArray()
    samples.forEach { rebuilt.put(it) }
    data.put(WEIGHTS, rebuilt)

    commit(data)
    return currentSnapshot(data, clock())
  }

  /**
   * Rebuild the Health Connect exercise mirrors (RFC 0025), keeping LeanOn-owned
   * sessions and replacing the mirror set with [items]. Persisted.
   */
  @Synchronized
  fun replaceExternalExercises(items: List<ExternalExercise>): JSONObject {
    val data = loadHostData()
    val existing = data.getJSONArray(EXERCISES)
    val rebuilt = JSONArray()
    for (index in 0 until existing.length()) {
      val session = existing.getJSONObject(index)
      if (session.optString(SOURCE) == HEALTH_CONNECT) continue
      rebuilt.put(session)
    }
    for (item in items) {
      rebuilt.put(
        JSONObject()
          .put(ID, item.id)
          .put(DATE, item.date)
          .put(TYPE_ID, item.typeId)
          .put(DURATION_MIN, item.durationMin)
          .put(KCAL, item.kcal)
          .put(SOURCE, HEALTH_CONNECT),
      )
    }
    data.put(EXERCISES, rebuilt)

    commit(data)
    return currentSnapshot(data, clock())
  }

  /**
   * Append a user-created food (RFC 0013) to `customFoods`, persist, and return
   * the full HostData. Records written before this slice lack the field, so it is
   * created on demand. The typed name is mirrored across both locales.
   */
  @Synchronized
  fun addCustomFood(
    id: String,
    name: String,
    kcal: Double,
    proteinG: Double,
    carbsG: Double,
    fatG: Double,
    defaultGrams: Double?,
    fiberG: Double = 0.0,
    sugarG: Double = 0.0,
    saturatedFatG: Double = 0.0,
    sodiumMg: Double = 0.0,
  ): JSONObject {
    val data = loadHostData()
    val customFoods =
      data.optJSONArray(CUSTOM_FOODS)
        ?: JSONArray().also { data.put(CUSTOM_FOODS, it) }

    val foodName = JSONObject()
      .put(EN, name)
      .put(ZH_CN, name)
    val macros = JSONObject()
      .put(PROTEIN_G, proteinG)
      .put(CARBS_G, carbsG)
      .put(FAT_G, fatG)
    val micros = JSONObject()
      .put(FIBER_G, fiberG)
      .put(SUGAR_G, sugarG)
      .put(SATURATED_FAT_G, saturatedFatG)
      .put(SODIUM_MG, sodiumMg)
    val item = JSONObject()
      .put(ID, id)
      .put(NAME, foodName)
      .put(KCAL, kcal)
      .put(MACROS, macros)
      .put(MICROS, micros)
      .put(SOURCE, CUSTOM)
    if (defaultGrams !== null) {
      item.put(DEFAULT_GRAMS, defaultGrams)
    }
    customFoods.put(item)

    commit(data)
    return currentSnapshot(data, clock())
  }

  /**
   * Insert or replace a user-owned food by id (RFC 0016 scanned foods), persist,
   * and return the full HostData. An entry with the same id is replaced instead
   * of being duplicated.
   */
  @Synchronized
  fun upsertUserFood(item: JSONObject): JSONObject {
    val data = loadHostData()
    val customFoods =
      data.optJSONArray(CUSTOM_FOODS)
        ?: JSONArray().also { data.put(CUSTOM_FOODS, it) }
    val id = item.getString(ID)

    var index = -1
    for (candidate in 0 until customFoods.length()) {
      if (customFoods.getJSONObject(candidate).getString(ID) == id) {
        index = candidate
        break
      }
    }
    if (index >= 0) customFoods.put(index, item) else customFoods.put(item)

    commit(data)
    return currentSnapshot(data, clock())
  }

  /**
   * Replace the editable content of the custom food with [id], keeping its id and
   * source (RFC 0014), then persist and return the full HostData. Throws when the
   * id is absent.
   */
  @Synchronized
  fun updateCustomFood(
    id: String,
    name: String,
    kcal: Double,
    proteinG: Double,
    carbsG: Double,
    fatG: Double,
    defaultGrams: Double?,
    fiberG: Double = 0.0,
    sugarG: Double = 0.0,
    saturatedFatG: Double = 0.0,
    sodiumMg: Double = 0.0,
  ): JSONObject {
    val data = loadHostData()
    val customFoods =
      data.optJSONArray(CUSTOM_FOODS)
        ?: throw NoSuchElementException("Custom food $id not found")

    var index = -1
    for (candidate in 0 until customFoods.length()) {
      if (customFoods.getJSONObject(candidate).getString(ID) == id) {
        index = candidate
        break
      }
    }
    if (index < 0) throw NoSuchElementException("Custom food $id not found")
    val original = customFoods.getJSONObject(index)
    val source = original.optString(SOURCE, CUSTOM)
    if (source != CUSTOM && source != OPEN_FOOD_FACTS) {
      throw NoSuchElementException("Custom food $id not found")
    }

    val foodName = JSONObject().put(EN, name).put(ZH_CN, name)
    val macros = JSONObject()
      .put(PROTEIN_G, proteinG)
      .put(CARBS_G, carbsG)
      .put(FAT_G, fatG)
    val micros = JSONObject()
      .put(FIBER_G, fiberG)
      .put(SUGAR_G, sugarG)
      .put(SATURATED_FAT_G, saturatedFatG)
      .put(SODIUM_MG, sodiumMg)
    val item = JSONObject()
      .put(ID, id)
      .put(NAME, foodName)
      .put(KCAL, kcal)
      .put(MACROS, macros)
      .put(MICROS, micros)
      .put(SOURCE, source)
    if (defaultGrams !== null) item.put(DEFAULT_GRAMS, defaultGrams)
    if (original.has(BARCODE)) item.put(BARCODE, original.getString(BARCODE))
    customFoods.put(index, item)

    commit(data)
    return currentSnapshot(data, clock())
  }

  /** Remove the custom food with [id], persist, and return the full HostData. */
  @Synchronized
  fun deleteCustomFood(id: String): JSONObject {
    val data = loadHostData()
    val customFoods =
      data.optJSONArray(CUSTOM_FOODS)
        ?: throw NoSuchElementException("Custom food $id not found")

    val remaining = JSONArray()
    var found = false
    for (candidate in 0 until customFoods.length()) {
      val existing = customFoods.getJSONObject(candidate)
      if (existing.getString(ID) == id && existing.optString(SOURCE, CUSTOM) in listOf(CUSTOM, OPEN_FOOD_FACTS)) {
        found = true
      } else {
        remaining.put(existing)
      }
    }
    if (!found) throw NoSuchElementException("Custom food $id not found")
    data.put(CUSTOM_FOODS, remaining)
    // Do not leave dangling favorite/recent references to the deleted food.
    removeIdFromList(data, FAVORITE_FOOD_IDS, id)
    removeIdFromList(data, RECENT_FOOD_IDS, id)

    commit(data)
    return currentSnapshot(data, clock())
  }

  /**
   * Pin ([favorite] true) or unpin (false) a food id (RFC 0015), persist, and
   * return the full HostData. Works for both bundled and user-owned foods and
   * tolerates ids that do not currently resolve to a food.
   */
  @Synchronized
  fun setFoodFavorite(id: String, favorite: Boolean): JSONObject {
    val data = loadHostData()
    val current = data.optJSONArray(FAVORITE_FOOD_IDS) ?: JSONArray()
    val result = JSONArray()
    if (favorite) {
      var seen = false
      for (index in 0 until current.length()) {
        val existing = current.getString(index)
        if (existing == id) seen = true
        result.put(existing)
      }
      if (!seen) result.put(id)
    } else {
      for (index in 0 until current.length()) {
        val existing = current.getString(index)
        if (existing != id) result.put(existing)
      }
    }
    data.put(FAVORITE_FOOD_IDS, result)

    commit(data)
    return currentSnapshot(data, clock())
  }

  /** Move [foodId] to the front of recent, removing duplicates and capping it. */
  private fun touchRecent(data: JSONObject, foodId: String) {
    val current = data.optJSONArray(RECENT_FOOD_IDS) ?: JSONArray()
    val updated = JSONArray().put(foodId)
    val seen = mutableSetOf(foodId)
    for (index in 0 until current.length()) {
      val existing = current.getString(index)
      if (!seen.add(existing)) continue
      if (updated.length() >= RECENT_LIMIT) break
      updated.put(existing)
    }
    data.put(RECENT_FOOD_IDS, updated)
  }

  /** Remove every occurrence of [id] from the id list stored at [key]. */
  private fun removeIdFromList(data: JSONObject, key: String, id: String) {
    val current = data.optJSONArray(key) ?: return
    val result = JSONArray()
    for (index in 0 until current.length()) {
      val existing = current.getString(index)
      if (existing != id) result.put(existing)
    }
    data.put(key, result)
  }

  private fun requireWriteDate(date: String) {
    strictDate(JSONObject().put("date", date))
    if (date > java.time.LocalDate.now(clock()).toString()) throw RecordsFailure("invalid-request", "Future record date")
  }

  /** All legacy native writes share the revision and derived intake projection. */
  private fun commit(data: JSONObject) {
    val legacy = data.getJSONArray("legacyIntake")
    val used = (0 until legacy.length()).map { legacy.getJSONObject(it).optString("id") }.filter { it.isNotBlank() }.toMutableSet()
    for (i in 0 until legacy.length()) if (!legacy.getJSONObject(i).has("id")) {
      val base = "legacy-intake-${legacy.getJSONObject(i).getString("date")}"
      legacy.getJSONObject(i).put("id", if (used.add(base)) base else "$base-${UUID.randomUUID()}")
    }
    projectDailyIntake(data)
    if (data.getLong("revision") >= 9007199254740991L) throw RecordsFailure("unavailable", "Revision exhausted")
    data.put("revision", data.getLong("revision") + 1L)
    val validated = migrateDailyRecords(data, clock())
    persist(recordFile, validated.toString())
  }

  @Synchronized
  fun mutate(operationId: String, expectedRevision: Long, mutation: JSONObject): JSONObject {
    val data = loadHostData()
    val result = applyDailyMutation(data, operationId, expectedRevision, mutation, clock())
    if (!result.getBoolean("replayed")) persist(recordFile, data.toString())
    return result.put("hostData", currentSnapshot(data, clock()))
  }

  private companion object {
    const val RECORD_FILE = "records.json"
    const val WEIGHTS = "weights"
    const val INTAKE = "intake"
    const val EXERCISES = "exercises"
    const val WATER = "water"
    const val AMOUNT_ML = "amountMl"
    const val TYPE_ID = "typeId"
    const val DURATION_MIN = "durationMin"
    const val DATE = "date"
    const val WEIGHT_KG = "weightKg"
    const val KCAL = "kcal"
    const val MACROS = "macros"
    const val MICROS = "micros"
    const val PROTEIN_G = "proteinG"
    const val CARBS_G = "carbsG"
    const val FAT_G = "fatG"
    const val FIBER_G = "fiberG"
    const val SUGAR_G = "sugarG"
    const val SATURATED_FAT_G = "saturatedFatG"
    const val SODIUM_MG = "sodiumMg"
    const val CUSTOM_FOODS = "customFoods"
    const val ID = "id"
    const val NAME = "name"
    const val EN = "en"
    const val ZH_CN = "zh-CN"
    const val DEFAULT_GRAMS = "defaultGrams"
    const val SOURCE = "source"
    const val HEALTH_CONNECT = "health_connect"
    const val CUSTOM = "custom"
    const val OPEN_FOOD_FACTS = "open-food-facts"
    const val BARCODE = "barcode"
    const val FAVORITE_FOOD_IDS = "favoriteFoodIds"
    const val RECENT_FOOD_IDS = "recentFoodIds"
    const val RECENT_LIMIT = 12
  }
}
