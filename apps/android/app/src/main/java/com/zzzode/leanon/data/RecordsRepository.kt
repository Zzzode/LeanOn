package com.zzzode.leanon.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

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
    return JSONObject(recordFile.readText(Charsets.UTF_8))
  }

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
    } else {
      val macros = JSONObject()
        .put(PROTEIN_G, proteinG)
        .put(CARBS_G, carbsG)
        .put(FAT_G, fatG)
      val sample = JSONObject()
        .put(DATE, date)
        .put(KCAL, kcal)
        .put(MACROS, macros)
      intake.put(sample)
    }

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
    val item = JSONObject()
      .put(ID, id)
      .put(NAME, foodName)
      .put(KCAL, kcal)
      .put(MACROS, macros)
      .put(SOURCE, CUSTOM)
    if (defaultGrams !== null) {
      item.put(DEFAULT_GRAMS, defaultGrams)
    }
    customFoods.put(item)

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
    val item = JSONObject()
      .put(ID, id)
      .put(NAME, foodName)
      .put(KCAL, kcal)
      .put(MACROS, macros)
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

    recordFile.writeText(data.toString(), Charsets.UTF_8)
    return data
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
    const val DATE = "date"
    const val WEIGHT_KG = "weightKg"
    const val KCAL = "kcal"
    const val MACROS = "macros"
    const val PROTEIN_G = "proteinG"
    const val CARBS_G = "carbsG"
    const val FAT_G = "fatG"
    const val CUSTOM_FOODS = "customFoods"
    const val ID = "id"
    const val NAME = "name"
    const val EN = "en"
    const val ZH_CN = "zh-CN"
    const val DEFAULT_GRAMS = "defaultGrams"
    const val SOURCE = "source"
    const val CUSTOM = "custom"
  }
}
