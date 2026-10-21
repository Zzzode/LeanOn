package com.zzzode.leanon.qa

import android.Manifest
import android.app.Activity
import android.app.Instrumentation
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.Bundle
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyMap
import com.zzzode.leanon.modules.ScannerModule
import com.zzzode.leanon.net.OpenFoodFactsClient
import com.zzzode.leanon.net.foodLookupFailureReason
import com.zzzode.leanon.scanner.BarcodeResultGate
import com.zzzode.leanon.scanner.ProductBarcodeDecoder
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.time.Instant
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Actual bundled ML Kit bitmap decoding and native HTTP; never launches a camera or requests permission. */
internal class ScannerNativeChecks(private val instrumentation: Instrumentation) {
  fun run() {
    val context = instrumentation.targetContext
    check(context.packageName == "com.zzzode.leanon.uiqa")
    val directory = File(context.cacheDir, "scanner-native").apply { mkdirs() }
    val original = File(context.filesDir, "records.json")
    fun hash(): String? = if (!original.exists()) null else MessageDigest.getInstance("SHA-256")
      .digest(original.readBytes()).joinToString("") { "%02x".format(it) }
    val before = hash()
    val permissionBefore = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
    val checks = JSONArray()
    val report = JSONObject().put("startedUtc", Instant.now().toString())
      .put("scope", "Camera-free real bitmap ML Kit decoder + readonly scanner status + native public OFF HTTP; no UI camera acceptance")
    try {
      var status: JavaOnlyMap? = null
      var statusCallbacks = 0
      instrumentation.runOnMainSync {
        ScannerModule(context).getStatus(null, object : Callback {
          override fun invoke(vararg args: Any?) { statusCallbacks++; status = args[0] as JavaOnlyMap }
        })
      }
      check(statusCallbacks == 1 && status?.hasKey("permission") == true)
      val wireStatus = JSONObject().put("cameraAvailable", status!!.getBoolean("cameraAvailable"))
        .put("hostAvailable", status!!.getBoolean("hostAvailable"))
        .put("permission", status!!.getString("permission"))
      check(!wireStatus.getBoolean("hostAvailable")) // The module is deliberately created without an Activity.
      report.put("actualStatusWithoutHost", wireStatus)
      checks.put(JSONObject().put("id", "status-without-host-no-permission-request").put("passed", true))

      val bitmap = ean13Fixture("3017620422003")
      File(directory, "ean13-generated-fixture.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
      val decoder = ProductBarcodeDecoder()
      val gate = BarcodeResultGate()
      var delivered = 0
      val detections = JSONArray()
      try {
        repeat(2) {
          val done = CountDownLatch(1)
          var failure = false
          instrumentation.runOnMainSync {
            decoder.decode(InputImage.fromBitmap(bitmap, 0), result = { value ->
              detections.put(value ?: JSONObject.NULL)
              if (gate.accept(value)) delivered++
            }, failure = { failure = true }, complete = { done.countDown() })
          }
          check(done.await(30, TimeUnit.SECONDS) && !failure) { "Bitmap decoder failed or timed out" }
        }
        check(detections.length() == 2 && detections.getString(0) == "3017620422003" && detections.getString(1) == "3017620422003")
        check(delivered == 1)
        report.put("actualBitmapDetections", detections).put("acceptedDeliveries", delivered)
        checks.put(JSONObject().put("id", "bundled-mlkit-real-bitmap-repeat-one-delivery").put("passed", true))
      } finally { instrumentation.runOnMainSync { decoder.close() }; bitmap.recycle() }

      val live = JSONObject().put("barcode", "3017620422003").put("startedUtc", Instant.now().toString())
      try {
        val product = OpenFoodFactsClient().lookup("3017620422003")
        live.put("outcome", if (product == null) "not-found" else "found")
        if (product != null) File(directory, "actual-live-off-product.json").writeText(product.toString(2))
      } catch (error: Exception) {
        live.put("outcome", "unavailable").put("reason", foodLookupFailureReason(error)).put("error", error.toString())
      }
      live.put("completedUtc", Instant.now().toString()); report.put("actualLiveLookup", live)
      check(permissionBefore == ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA))
      check(before == hash())
      checks.put(JSONObject().put("id", "camera-permission-and-original-records-unchanged").put("passed", true))
      report.put("success", true)
    } catch (error: Throwable) { report.put("success", false).put("error", error.toString()) }
    report.put("completedUtc", Instant.now().toString()).put("checks", checks)
      .put("originalRecordsBefore", before ?: JSONObject.NULL).put("originalRecordsAfter", hash() ?: JSONObject.NULL)
      .put("cameraGrantedBefore", permissionBefore == PackageManager.PERMISSION_GRANTED)
      .put("cameraGrantedAfter", ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    File(directory, "report.json").writeText(report.toString(2))
    instrumentation.finish(if (report.optBoolean("success")) Activity.RESULT_OK else Activity.RESULT_CANCELED,
      Bundle().apply { putString("report", "cache/scanner-native/report.json") })
  }

  /** Deterministic GS1 EAN-13 pixels, not a camera image or user-supplied health data. */
  private fun ean13Fixture(value: String): Bitmap {
    val left = listOf("0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011")
    val parity = listOf("LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL")[value[0] - '0']
    fun invert(bits: String) = bits.map { if (it == '0') '1' else '0' }.joinToString("")
    val bits = "101" + (1..6).joinToString("") { index ->
      val l = left[value[index] - '0']; if (parity[index-1] == 'L') l else invert(l.reversed())
    } + "01010" + (7..12).joinToString("") { invert(left[value[it] - '0']) } + "101"
    return Bitmap.createBitmap(640, 300, Bitmap.Config.ARGB_8888).also { bitmap ->
      val canvas = Canvas(bitmap); canvas.drawColor(Color.WHITE)
      val paint = Paint().apply { color = Color.BLACK }
      bits.forEachIndexed { index, c -> if (c == '1') canvas.drawRect(100f + index*4, 40f, 104f + index*4, 260f, paint) }
    }
  }
}
