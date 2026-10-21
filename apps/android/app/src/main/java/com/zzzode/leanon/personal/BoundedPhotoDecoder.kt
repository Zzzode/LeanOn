package com.zzzode.leanon.personal

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ColorSpace
import com.facebook.imagepipeline.bitmaps.SimpleBitmapReleaser
import com.facebook.imagepipeline.common.ImageDecodeOptions
import com.facebook.imagepipeline.decoder.ImageDecoder
import com.facebook.imagepipeline.image.CloseableImage
import com.facebook.imagepipeline.image.CloseableStaticBitmap
import com.facebook.imagepipeline.image.EncodedImage
import com.facebook.imagepipeline.image.QualityInfo
import java.io.ByteArrayOutputStream
import java.io.IOException

internal fun photoPreviewSampleSize(width: Int, height: Int): Int {
  if (width !in 1..20000 || height !in 1..20000) throw IOException("Unsupported photo dimensions")
  var sample = 1
  while (((width + sample - 1) / sample).toLong() * ((height + sample - 1) / sample) > 4_194_304L) sample *= 2
  return sample
}

/** The SDK's default image service requests full resolution, so private previews bound decoding explicitly. */
internal class BoundedPhotoDecoder : ImageDecoder {
  override fun decode(image: EncodedImage, length: Int, quality: QualityInfo, options: ImageDecodeOptions): CloseableImage {
    val bytes = image.inputStream?.use { input ->
      val output = ByteArrayOutputStream(); val chunk = ByteArray(8192)
      while (true) {
        val count = input.read(chunk); if (count < 0) break
        if (output.size() + count > 20 * 1024 * 1024) throw IOException("Photo exceeds supported size")
        output.write(chunk, 0, count)
      }
      output.toByteArray()
    } ?: throw IOException("Photo bytes unavailable")
    try {
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
      if (bounds.outMimeType != "image/jpeg") throw IOException("Private previews require canonical JPEG")
      validateSanitizedJpeg(bytes, bounds.outWidth, bounds.outHeight)
      val decode = BitmapFactory.Options().apply {
        inSampleSize = photoPreviewSampleSize(bounds.outWidth, bounds.outHeight)
        inPreferredConfig = Bitmap.Config.ARGB_8888
        inPreferredColorSpace = ColorSpace.get(ColorSpace.Named.SRGB)
      }
      val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, decode) ?: throw IOException("Photo pixels unavailable")
      if (bitmap.width.toLong() * bitmap.height > 4_194_304L) { bitmap.recycle(); throw IOException("Photo decode exceeds supported size") }
      return CloseableStaticBitmap(bitmap, SimpleBitmapReleaser.getInstance(), quality, 0)
    } finally { bytes.fill(0) }
  }
}
