package com.zzzode.leanon.net

import org.json.JSONObject
import java.io.IOException
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.SocketTimeoutException
import com.zzzode.leanon.scanner.ProductBarcode

internal class OffServiceResponseError(message: String) : IOException(message)

internal fun foodLookupFailureReason(error: Exception): String = when (error) {
  is SocketTimeoutException -> "timeout"
  is OffServiceResponseError -> "service-response"
  else -> "offline"
}

/**
 * Minimal Open Food Facts v2 client (RFC 0016) over HttpURLConnection, so no new
 * networking dependency is introduced. Returns the product JSONObject for a
 * known barcode, null when OFF reports status 0 / HTTP 404, and throws on
 * transport errors so the caller can map them to the `unavailable` error code.
 */
class OpenFoodFactsClient internal constructor(
  private val connect: (URL) -> HttpURLConnection,
) {
  constructor() : this({ it.openConnection() as HttpURLConnection })

  fun lookup(barcode: String): JSONObject? {
    val normalized = ProductBarcode.normalize(barcode) ?: throw IllegalArgumentException("Invalid product barcode")
    val url = URL("$BASE_URL$normalized.json?fields=$FIELDS")
    val connection = connect(url)
    connection.connectTimeout = TIMEOUT_MS
    connection.readTimeout = TIMEOUT_MS
    connection.requestMethod = "GET"
    connection.instanceFollowRedirects = false
    connection.useCaches = false
    connection.setRequestProperty("User-Agent", USER_AGENT)
    connection.setRequestProperty("Accept", "application/json")
    try {
      val code = connection.responseCode
      if (code == HttpURLConnection.HTTP_NOT_FOUND) return null
      if (code != HttpURLConnection.HTTP_OK) {
        throw OffServiceResponseError("Open Food Facts responded with HTTP $code")
      }
      val bytes = connection.inputStream.use { stream ->
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (output.size() <= MAX_RESPONSE_BYTES) {
          val count = stream.read(buffer, 0, minOf(buffer.size, MAX_RESPONSE_BYTES + 1 - output.size()))
          if (count < 0) break
          output.write(buffer, 0, count)
        }
        output.toByteArray()
      }
      if (bytes.size > MAX_RESPONSE_BYTES) throw OffServiceResponseError("Open Food Facts response is too large")
      val response = try { JSONObject(String(bytes, Charsets.UTF_8)) }
      catch (_: Exception) { throw OffServiceResponseError("Invalid Open Food Facts response") }
      val status = response.opt("status")
      if (status !is Number || status.toDouble() !in listOf(0.0, 1.0)) throw OffServiceResponseError("Invalid Open Food Facts status")
      if (status.toDouble() == 0.0) return null
      return response.optJSONObject("product") ?: throw OffServiceResponseError("Missing Open Food Facts product")
    } finally {
      connection.disconnect()
    }
  }

  private companion object {
    const val BASE_URL = "https://world.openfoodfacts.org/api/v2/product/"
    const val FIELDS =
      "product_name,generic_name,nutriments,serving_quantity,serving_size,serving_quantity_unit,product_quantity_unit"
    const val TIMEOUT_MS = 8000
    const val MAX_RESPONSE_BYTES = 2_000_000
    const val USER_AGENT = "LeanOn/0.1 (https://github.com/Zzzode/LeanOn)"
  }
}
