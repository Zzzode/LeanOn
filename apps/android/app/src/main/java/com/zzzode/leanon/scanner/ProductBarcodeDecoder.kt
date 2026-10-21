package com.zzzode.leanon.scanner

import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.atomic.AtomicInteger

/** One valid result or failure per scan; unreadable frames must leave scanning active. */
internal class BarcodeResultGate {
  private val state = AtomicInteger(0)
  val active: Boolean get() = state.get() == 0
  fun accept(value: String?): Boolean = value != null && state.compareAndSet(0, 1)
  fun fail(): Boolean = state.compareAndSet(0, 1)
  fun close() { state.set(2) }
}

/** Shared by the real frame analyzer and camera-free bitmap instrumentation. */
internal class ProductBarcodeDecoder {
  private val scanner = BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(
    Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E,
    Barcode.FORMAT_CODE_128, Barcode.FORMAT_ITF,
  ).build())

  fun decode(image: InputImage, result: (String?) -> Unit, failure: () -> Unit, complete: () -> Unit) {
    try {
      scanner.process(image)
        .addOnSuccessListener { codes ->
          result(codes.firstNotNullOfOrNull { code ->
            val raw = code.rawValue ?: return@firstNotNullOfOrNull null
            when (code.format) {
              Barcode.FORMAT_UPC_E -> ProductBarcode.normalizeUpcE(raw)
              Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A,
              Barcode.FORMAT_CODE_128, Barcode.FORMAT_ITF -> ProductBarcode.normalize(raw)
              else -> null
            }
          })
        }
        .addOnFailureListener { failure() }
        .addOnCompleteListener { complete() }
    } catch (_: Exception) { failure(); complete() }
  }

  fun close() { scanner.close() }
}
