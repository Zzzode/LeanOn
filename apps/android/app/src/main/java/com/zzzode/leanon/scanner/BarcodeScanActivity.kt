package com.zzzode.leanon.scanner

import android.Manifest
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
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
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import com.zzzode.leanon.R

/**
 * Full-screen CameraX scanner (RFC 0016). It requests the camera permission,
 * analyses frames with ML Kit's barcode client, and returns the first recognized
 * code through [BarcodeScanLauncher]. Back/cancel returns an explicit cancelled
 * result; permission denial and camera failures return errors.
 */
class BarcodeScanActivity : AppCompatActivity() {

  private lateinit var previewView: PreviewView
  private val cameraExecutor: ExecutorService = Executors.newSingleThreadExecutor()
  @Volatile private var delivered = false
  private var destroyed = false
  private var analyzer: BarcodeAnalyzer? = null

  private val requestPermission =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
      if (granted) startCamera() else fail("not-authorized", "Camera permission denied")
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    previewView = PreviewView(this)
    val root = FrameLayout(this).apply { fitsSystemWindows = true }
    root.addView(previewView, FrameLayout.LayoutParams(-1, -1))
    root.addView(Button(this).apply {
      text = getString(R.string.barcode_scan_cancel)
      setOnClickListener { cancel() }
    }, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.END))
    setContentView(root)
    onBackPressedDispatcher.addCallback(
      this,
      object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
          cancel()
        }
      },
    )

    if (!BarcodeCameraStatus.available(this)) {
      fail("unavailable", "Back camera is unavailable")
      return
    }
    when (BarcodeCameraStatus.permission(this, this)) {
      CameraPermission.AUTHORIZED -> startCamera()
      CameraPermission.DENIED, CameraPermission.RESTRICTED -> fail("not-authorized", "Camera permission denied")
      CameraPermission.NOT_DETERMINED -> {
        if (!BarcodeCameraStatus.markRequested(this)) {
          fail("unavailable", "Camera permission state could not be saved")
        } else requestPermission.launch(Manifest.permission.CAMERA)
      }
    }
  }

  private fun startCamera() {
    if (delivered || destroyed) return
    val providerFuture = try { ProcessCameraProvider.getInstance(this) }
    catch (_: Exception) { fail("unavailable", "Camera could not be started"); return }
    providerFuture.addListener(
      {
        try {
          if (delivered || destroyed) return@addListener
          val provider = providerFuture.get()
          if (!provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)) {
            fail("unavailable", "Back camera is unavailable"); return@addListener
          }
          val preview = Preview.Builder().build().also {
            it.setSurfaceProvider(previewView.surfaceProvider)
          }
          val analysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
          val frameAnalyzer = BarcodeAnalyzer(
            onResult = { value -> runOnUiThread { succeed(value) } },
            onFailure = { runOnUiThread { fail("unavailable", "Barcode recognition is unavailable") } },
          )
          analyzer = frameAnalyzer
          analysis.setAnalyzer(cameraExecutor, frameAnalyzer)
          provider.unbindAll()
          provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
        } catch (_: Exception) { fail("unavailable", "Camera could not be started") }
      },
      ContextCompat.getMainExecutor(this),
    )
  }

  private fun succeed(barcode: String) {
    if (delivered || destroyed) return
    delivered = true
    BarcodeScanLauncher.deliver(BarcodeScanResult.Found(barcode))
    finish()
  }

  private fun cancel() {
    if (delivered || destroyed) return
    delivered = true
    BarcodeScanLauncher.deliver(BarcodeScanResult.Cancelled)
    finish()
  }

  private fun fail(code: String, message: String) {
    if (delivered || destroyed) return
    delivered = true
    BarcodeScanLauncher.deliver(BarcodeScanResult.Failure(code, message))
    finish()
  }

  override fun onDestroy() {
    if (isFinishing && !delivered) {
      delivered = true
      BarcodeScanLauncher.deliver(BarcodeScanResult.Cancelled)
    }
    destroyed = true
    analyzer?.close()
    super.onDestroy()
    cameraExecutor.shutdown()
  }
}

/** Feeds CameraX frames to ML Kit and reports the first readable barcode once. */
private class BarcodeAnalyzer(
  private val onResult: (String) -> Unit,
  private val onFailure: () -> Unit,
) : ImageAnalysis.Analyzer {

  private val decoder = ProductBarcodeDecoder()
  private val gate = BarcodeResultGate()
  private val processing = AtomicBoolean(false)
  private val stopped = AtomicBoolean(false)

  fun close() { stopped.set(true); gate.close(); decoder.close() }

  @ExperimentalGetImage
  override fun analyze(imageProxy: ImageProxy) {
    val mediaImage = imageProxy.image
    if (mediaImage == null || !gate.active || stopped.get() || !processing.compareAndSet(false, true)) {
      imageProxy.close()
      return
    }
    val image = try { InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees) }
    catch (_: Exception) {
      processing.set(false); imageProxy.close()
      if (!stopped.get() && gate.fail()) onFailure()
      return
    }
    decoder.decode(image,
      result = { value -> if (value != null && !stopped.get() && gate.accept(value)) onResult(value) },
      failure = { if (!stopped.get() && gate.fail()) onFailure() },
      complete = { processing.set(false); imageProxy.close() },
    )
  }
}
