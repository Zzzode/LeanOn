package com.zzzode.leanon.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/**
 * App-private JSON record store. The native side is the persistence authority
 * (RFC 0010). On first launch the packaged seed is copied into filesDir; each
 * write upserts the weight for a date and returns the full HostData snapshot.
 *
 * This slice stores plain JSON. Encryption and the envelope/migration model are
 * tracked under RFC 0008 and deliberately not applied here.
 */
class RecordsRepository(context: Context) {

  private val appContext: Context = context.applicationContext
  private val recordFile: File = File(appContext.filesDir, RECORD_FILE)

  /** Load the current HostData, seeding the private store on first launch. */
  fun loadHostData(): JSONObject {
    ensureSeeded()
    val data = JSONObject(recordFile.readText(Charsets.UTF_8))
    var modified = ensureExerciseIds(data)
    if (ensureMicros(data)) modified = true
    if (modified) {
      recordFile.writeText(data.toString(), Charsets.UTF_8)
    }
    return data
  }

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
    for (key in listOf(INTAKE, CUSTOM_FOODS)) {
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
  fun addWeight(date: String, weightKg: Double): JSONObject {
    val data = loadHostData()
    val weights = data.getJSONArray(WEIGHTS)

    var existing = -1
    for (index in 0 until weights.length()) {
      if (weights.getJSONObject(index).getString(DATE) == date) {
        existing = index
        break
      }
    }

    val sample = JSONObject()
      .put(DATE, date)
      .put(WEIGHT_KG, weightKg)

    if (existing >= 0) {
      weights.put(existing, sample)
    } else {
      weights.put(sample)
    }

    recordFile.writeText(data.toString(), Charsets.UTF_8)
    return data
  }

  /**
   * Add a meal to [date], accumulating calories and macros into the day's intake
   * sample (multiple meals add together) or creating it, then persist and return
   * the full HostData (RFC 0012).
   */
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
    val data = loadHostData()
    val intake = data.getJSONArray(INTAKE)

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

    recordFile.writeText(data.toString(), Charsets.UTF_8)
    return data
  }

  /**
   * Insert or replace the total water for [date] (RFC 0023), persist, and return
   * the full HostData. Only today's total is logged (the latest date), so a new
   * day is appended and date ordering is preserved.
   */
  fun upsertWater(date: String, amountMl: Double): JSONObject {
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

    val sample = JSONObject()
      .put(DATE, date)
      .put(AMOUNT_ML, amountMl)

    if (existing >= 0) {
      water.put(existing, sample)
    } else {
      water.put(sample)
    }

    recordFile.writeText(data.toString(), Charsets.UTF_8)
    return data
  }

  /**
   * Append an exercise session (RFC 0017) to `exercises`, persist, and return the
   * full HostData. Sessions are kept individually rather than merged per day.
   */
  fun addExercise(
    date: String,
    typeId: String,
    durationMin: Double,
    kcal: Double,
  ): JSONObject {
    val data = loadHostData()
    val exercises = data.getJSONArray(EXERCISES)
    val session = JSONObject()
      .put(ID, newExerciseId())
      .put(DATE, date)
      .put(TYPE_ID, typeId)
      .put(DURATION_MIN, durationMin)
      .put(KCAL, kcal)
    exercises.put(session)

    recordFile.writeText(data.toString(), Charsets.UTF_8)
    return data
  }

  /** Replace a session (RFC 0018) in place, keeping its id; throw if absent. */
  fun updateExercise(
    id: String,
    date: String,
    typeId: String,
    durationMin: Double,
    kcal: Double,
  ): JSONObject {
    val data = loadHostData()
    val exercises = data.getJSONArray(EXERCISES)
    var found = false
    for (index in 0 until exercises.length()) {
      val session = exercises.getJSONObject(index)
      if (session.optString(ID) == id) {
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

    recordFile.writeText(data.toString(), Charsets.UTF_8)
    return data
  }

  /** Remove a session (RFC 0018); throw if the id is absent. */
  fun deleteExercise(id: String): JSONObject {
    val data = loadHostData()
    val existing = data.getJSONArray(EXERCISES)
    val updated = JSONArray()
    var found = false
    for (index in 0 until existing.length()) {
      val session = existing.getJSONObject(index)
      if (session.optString(ID) == id) {
        found = true
      } else {
        updated.put(session)
      }
    }
    if (!found) {
      throw NoSuchElementException("Exercise session not found: $id")
    }
    data.put(EXERCISES, updated)

    recordFile.writeText(data.toString(), Charsets.UTF_8)
    return data
  }

  /**
   * Append a user-created food (RFC 0013) to `customFoods`, persist, and return
   * the full HostData. Records written before this slice lack the field, so it is
   * created on demand. The typed name is mirrored across both locales.
   */
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

    recordFile.writeText(data.toString(), Charsets.UTF_8)
    return data
  }

  /**
   * Insert or replace a user-owned food by id (RFC 0016 scanned foods), persist,
   * and return the full HostData. An entry with the same id is replaced instead
   * of being duplicated.
   */
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

    recordFile.writeText(data.toString(), Charsets.UTF_8)
    return data
  }

  /**
   * Replace the editable content of the custom food with [id], keeping its id and
   * source (RFC 0014), then persist and return the full HostData. Throws when the
   * id is absent.
   */
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
    val source = customFoods.getJSONObject(index).optString(SOURCE, CUSTOM)

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
    customFoods.put(index, item)

    recordFile.writeText(data.toString(), Charsets.UTF_8)
    return data
  }

  /** Remove the custom food with [id], persist, and return the full HostData. */
  fun deleteCustomFood(id: String): JSONObject {
    val data = loadHostData()
    val customFoods =
      data.optJSONArray(CUSTOM_FOODS)
        ?: throw NoSuchElementException("Custom food $id not found")

    val remaining = JSONArray()
    var found = false
    for (candidate in 0 until customFoods.length()) {
      val existing = customFoods.getJSONObject(candidate)
      if (existing.getString(ID) == id) {
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

    recordFile.writeText(data.toString(), Charsets.UTF_8)
    return data
  }

  /**
   * Pin ([favorite] true) or unpin (false) a food id (RFC 0015), persist, and
   * return the full HostData. Works for both bundled and user-owned foods and
   * tolerates ids that do not currently resolve to a food.
   */
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

    recordFile.writeText(data.toString(), Charsets.UTF_8)
    return data
  }

  /** Move [foodId] to the front of recent, removing duplicates and capping it. */
  private fun touchRecent(data: JSONObject, foodId: String) {
    val current = data.optJSONArray(RECENT_FOOD_IDS) ?: JSONArray()
    val updated = JSONArray().put(foodId)
    for (index in 0 until current.length()) {
      val existing = current.getString(index)
      if (existing == foodId) continue
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

  private fun ensureSeeded() {
    if (recordFile.exists()) return
    val seed = appContext.assets
      .open(SEED_ASSET)
      .bufferedReader(Charsets.UTF_8)
      .use { it.readText() }
    recordFile.writeText(seed, Charsets.UTF_8)
  }

  private companion object {
    const val RECORD_FILE = "records.json"
    const val SEED_ASSET = "seed/hostData.json"
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
    const val CUSTOM = "custom"
    const val OPEN_FOOD_FACTS = "open-food-facts"
    const val BARCODE = "barcode"
    const val FAVORITE_FOOD_IDS = "favoriteFoodIds"
    const val RECENT_FOOD_IDS = "recentFoodIds"
    const val RECENT_LIMIT = 12
  }
}
