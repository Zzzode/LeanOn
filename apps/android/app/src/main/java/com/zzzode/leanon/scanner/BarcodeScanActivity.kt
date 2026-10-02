package com.zzzode.leanon.scanner

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Full-screen CameraX scanner (RFC 0016). It requests the camera permission,
 * analyses frames with ML Kit's barcode client, and returns the first recognized
 * code through [BarcodeScanLauncher]. Back/cancel or a permission denial returns
 * a null barcode.
 */
class BarcodeScanActivity : AppCompatActivity() {

  private lateinit var previewView: PreviewView
  private val cameraExecutor: ExecutorService = Executors.newSingleThreadExecutor()
  @Volatile private var delivered = false

  private val requestPermission =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
      if (granted) startCamera() else cancel()
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    previewView = PreviewView(this)
    setContentView(previewView)

    if (hasCameraPermission()) {
      startCamera()
    } else {
      requestPermission.launch(Manifest.permission.CAMERA)
    }
  }

  private fun hasCameraPermission(): Boolean =
    ContextCompat.checkSelfPermission(
      this,
      Manifest.permission.CAMERA,
    ) == PackageManager.PERMISSION_GRANTED

  private fun startCamera() {
    val providerFuture = ProcessCameraProvider.getInstance(this)
    providerFuture.addListener(
      {
        val provider = providerFuture.get()
        val preview =
          Preview.Builder().build().also {
            it.setSurfaceProvider(previewView.surfaceProvider)
          }
        val analysis =
          ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
        analysis.setAnalyzer(
          cameraExecutor,
          BarcodeAnalyzer { value ->
            runOnUiThread { succeed(value) }
          },
        )
        provider.unbindAll()
        provider.bindToLifecycle(
          this,
          CameraSelector.DEFAULT_BACK_CAMERA,
          preview,
          analysis,
        )
      },
      ContextCompat.getMainExecutor(this),
    )
  }

  private fun succeed(barcode: String) {
    if (delivered) return
    delivered = true
    BarcodeScanLauncher.deliver(barcode)
    finish()
  }

  private fun cancel() {
    if (delivered) return
    delivered = true
    BarcodeScanLauncher.deliver(null)
    finish()
  }

  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    cancel()
  }

  override fun onDestroy() {
    super.onDestroy()
    cameraExecutor.shutdown()
  }
}

/** Feeds CameraX frames to ML Kit and reports the first readable barcode once. */
private class BarcodeAnalyzer(
  private val onResult: (String) -> Unit,
) : ImageAnalysis.Analyzer {

  private val scanner =
    BarcodeScanning.getClient(
      BarcodeScannerOptions.Builder()
        .setBarcodeFormats(
          Barcode.FORMAT_EAN_13,
          Barcode.FORMAT_EAN_8,
          Barcode.FORMAT_UPC_A,
          Barcode.FORMAT_UPC_E,
          Barcode.FORMAT_CODE_128,
        )
        .build(),
    )

  @Volatile private var handled = false

  @ExperimentalGetImage
  override fun analyze(imageProxy: ImageProxy) {
    val mediaImage = imageProxy.image
    if (mediaImage == null || handled) {
      imageProxy.close()
      return
    }
    val image =
      InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
    scanner.process(image)
      .addOnSuccessListener { barcodes ->
        val value = barcodes.firstOrNull()?.rawValue
        if (value != null && !handled) {
          handled = true
          onResult(value)
        }
      }
      .addOnCompleteListener { imageProxy.close() }
  }
}
