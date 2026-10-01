package com.zzzode.leanon.data

import android.content.Context
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
    const val DATE = "date"
    const val WEIGHT_KG = "weightKg"
  }
}
