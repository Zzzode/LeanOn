package com.zzzode.leanon.net

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Minimal Open Food Facts v2 client (RFC 0016) over HttpURLConnection, so no new
 * networking dependency is introduced. Returns the product JSONObject for a
 * known barcode, null when OFF reports status 0 / HTTP 404, and throws on
 * transport errors so the caller can map them to the `unavailable` error code.
 */
class OpenFoodFactsClient {

  fun lookup(barcode: String): JSONObject? {
    val url = URL("$BASE_URL$barcode.json?fields=$FIELDS")
    val connection = url.openConnection() as HttpURLConnection
    connection.connectTimeout = TIMEOUT_MS
    connection.readTimeout = TIMEOUT_MS
    connection.requestMethod = "GET"
    connection.setRequestProperty("User-Agent", USER_AGENT)
    try {
      val code = connection.responseCode
      if (code == HttpURLConnection.HTTP_NOT_FOUND) return null
      if (code != HttpURLConnection.HTTP_OK) {
        throw IOException("Open Food Facts responded with HTTP $code")
      }
      val body =
        connection.inputStream
          .bufferedReader(Charsets.UTF_8)
          .use { it.readText() }
      val response = JSONObject(body)
      if (response.optInt("status", 0) != 1) return null
      return response.optJSONObject("product")
    } finally {
      connection.disconnect()
    }
  }

  private companion object {
    const val BASE_URL = "https://world.openfoodfacts.org/api/v2/product/"
    const val FIELDS =
      "product_name,generic_name,nutriments,serving_quantity,serving_size"
    const val TIMEOUT_MS = 8000
    const val USER_AGENT = "LeanOn/0.1 (https://github.com/Zzzode/LeanOn)"
  }
}
