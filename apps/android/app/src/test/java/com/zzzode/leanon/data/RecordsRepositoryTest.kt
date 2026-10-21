package com.zzzode.leanon.data

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.IOException
import java.util.concurrent.Callable
import java.util.concurrent.Executors

class RecordsRepositoryTest {
  @get:Rule val temporary = TemporaryFolder()
  private fun file() = temporary.root.resolve("records.json")
  private fun seed(): String = """{"today":"2026-10-06","weights":[],"intake":[],"exercises":[],"water":[],"customFoods":[],"favoriteFoodIds":[],"recentFoodIds":[]}"""
  private fun repository() = RecordsRepository(file(), ::seed)

  @Test fun waterReplacesTheTotalAndSurvivesAStoreRestart() {
    val store = repository()
    store.upsertWater("2026-10-06", 750.0)
    store.upsertWater("2026-10-06", 250.0)
    store.upsertWater("2026-10-05", 0.0)
    val water = repository().loadHostData().getJSONArray("water")
    assertEquals(2, water.length())
    assertEquals(250.0, water.getJSONObject(0).getDouble("amountMl"), 0.0)
    assertEquals(0.0, water.getJSONObject(1).getDouble("amountMl"), 0.0)
  }

  @Test fun customFoodsRoundTripUpdateAndDeleteCleanReferences() {
    val store = repository()
    store.addCustomFood("custom-1", "Oats", 370.0, 12.0, 60.0, 7.0, 40.0, 8.0, 1.0, 1.2, 4.0)
    store.setFoodFavorite("custom-1", true)
    store.addIntake("2026-10-06", 148.0, 4.8, 24.0, 2.8, foodId = "custom-1")
    store.updateCustomFood("custom-1", "Oats revised", 380.0, 13.0, 61.0, 8.0, null)
    val food = repository().loadHostData().getJSONArray("customFoods").getJSONObject(0)
    assertEquals("custom", food.getString("source"))
    assertEquals("Oats revised", food.getJSONObject("name").getString("zh-CN"))
    assertFalse(food.has("defaultGrams"))
    val after = store.deleteCustomFood("custom-1")
    for (key in listOf("customFoods", "favoriteFoodIds", "recentFoodIds")) assertEquals(0, after.getJSONArray(key).length())
    assertThrows(NoSuchElementException::class.java) { store.deleteCustomFood("custom-1") }
  }

  @Test fun importedFoodEditsPreserveBarcodeAndSource() {
    val store = repository()
    val food = JSONObject().put("id", "off-12345678").put("barcode", "12345678")
      .put("name", JSONObject().put("en", "Original").put("zh-CN", "Original"))
      .put("kcal", 100).put("source", "open-food-facts")
      .put("macros", JSONObject().put("proteinG", 1).put("carbsG", 2).put("fatG", 3))
    store.upsertUserFood(food)
    val updated = store.updateCustomFood("off-12345678", "Edited", 110.0, 1.0, 2.0, 3.0, 50.0)
      .getJSONArray("customFoods").getJSONObject(0)
    assertEquals("12345678", updated.getString("barcode"))
    assertEquals("open-food-facts", updated.getString("source"))
  }

  @Test fun bundledFoodsCannotBeMutatedThroughTheUserFoodApi() {
    val store = repository()
    val host = store.loadHostData()
    host.getJSONArray("customFoods").put(JSONObject().put("id", "bundled").put("source", "table"))
    writeRecordsAtomically(file(), host.toString())
    assertThrows(NoSuchElementException::class.java) { store.updateCustomFood("bundled", "Changed", 100.0, 0.0, 0.0, 0.0, null) }
    assertThrows(NoSuchElementException::class.java) { store.deleteCustomFood("bundled") }
    assertEquals(1, repository().loadHostData().getJSONArray("customFoods").length())
  }

  @Test fun favoritesAreIdempotentAndAllowUnknownIds() {
    val store = repository()
    store.setFoodFavorite("future-food", true)
    store.setFoodFavorite("future-food", true)
    assertEquals(1, repository().loadHostData().getJSONArray("favoriteFoodIds").length())
    assertEquals(0, store.setFoodFavorite("future-food", false).getJSONArray("favoriteFoodIds").length())
  }

  @Test fun recentFoodsDeduplicateAndStayMostRecentFirstWithLimitTwelve() {
    val store = repository()
    val host = store.loadHostData().put("recentFoodIds", JSONArray(listOf("a", "a", "b", "b")))
    writeRecordsAtomically(file(), host.toString())
    store.addIntake("2026-10-06", 10.0, 0.0, 0.0, 0.0, foodId = "c")
    assertEquals("[\"c\",\"a\",\"b\"]", store.loadHostData().getJSONArray("recentFoodIds").toString())
    for (index in 1..15) store.addIntake("2026-10-06", 10.0, 0.0, 0.0, 0.0, foodId = "f$index")
    store.addIntake("2026-10-06", 10.0, 0.0, 0.0, 0.0, foodId = "f10")
    val recent = repository().loadHostData().getJSONArray("recentFoodIds")
    assertEquals(12, recent.length())
    assertEquals("f10", recent.getString(0))
    assertEquals(12, (0 until recent.length()).map { recent.getString(it) }.toSet().size)
  }

  @Test fun failedPersistenceKeepsTheLastGoodSnapshot() {
    val store = repository()
    store.upsertWater("2026-10-06", 250.0)
    val previous = file().readText()
    val failing = RecordsRepository(file(), ::seed, persist = { _, _ -> throw IOException("Disk full") })
    assertThrows(IOException::class.java) { failing.upsertWater("2026-10-06", 500.0) }
    assertEquals(previous, file().readText())
    assertEquals(250.0, repository().loadHostData().getJSONArray("water").getJSONObject(0).getDouble("amountMl"), 0.0)
  }

  @Test fun parallelMealWritesDoNotLoseAggregatesOrCorruptTheFile() {
    val store = repository()
    store.loadHostData()
    val executor = Executors.newFixedThreadPool(6)
    try {
      val tasks = (1..60).map { Callable { store.addIntake("2026-10-06", 10.0, 1.0, 2.0, 3.0) } }
      executor.invokeAll(tasks).forEach { it.get() }
    } finally { executor.shutdown() }
    val meal = repository().loadHostData().getJSONArray("intake").getJSONObject(0)
    assertEquals(600.0, meal.getDouble("kcal"), 0.0)
    assertEquals(60.0, meal.getJSONObject("macros").getDouble("proteinG"), 0.0)
    assertTrue(temporary.root.listFiles()!!.none { it.extension == "tmp" })
  }
}
