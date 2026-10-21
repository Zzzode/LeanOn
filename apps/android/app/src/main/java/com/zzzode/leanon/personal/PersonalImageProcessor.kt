package com.zzzode.leanon.personal

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorSpace
import android.media.ExifInterface
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException

internal data class SanitizedPhoto(val bytes: ByteArray, val width: Int, val height: Int)
/** Decode pixels and encode a new JPEG; source EXIF, GPS, filename and comment bytes are discarded. */
internal object PersonalImageProcessor {
  fun sanitize(source: ByteArray): SanitizedPhoto {
    if (source.isEmpty() || source.size > 20 * 1024 * 1024) throw IOException("Photo exceeds supported size")
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }; BitmapFactory.decodeByteArray(source, 0, source.size, bounds)
    if (bounds.outWidth !in 1..20000 || bounds.outHeight !in 1..20000) throw IOException("Unsupported photo dimensions")
    var sample = 1
    while ((bounds.outWidth / sample).toLong() * (bounds.outHeight / sample) > 4_194_304L) sample *= 2
    val bitmap = BitmapFactory.decodeByteArray(source, 0, source.size, BitmapFactory.Options().apply { inSampleSize = sample; inPreferredColorSpace = ColorSpace.get(ColorSpace.Named.SRGB) }) ?: throw IOException("Image cannot be decoded")
    val orientation = runCatching { ExifInterface(ByteArrayInputStream(source)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
    val matrix = Matrix().apply {
      when (orientation) {
        ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> setScale(-1f, 1f)
        ExifInterface.ORIENTATION_ROTATE_180 -> setRotate(180f)
        ExifInterface.ORIENTATION_FLIP_VERTICAL -> setScale(1f, -1f)
        ExifInterface.ORIENTATION_TRANSPOSE -> { setRotate(90f); postScale(-1f, 1f) }
        ExifInterface.ORIENTATION_ROTATE_90 -> setRotate(90f)
        ExifInterface.ORIENTATION_TRANSVERSE -> { setRotate(-90f); postScale(-1f, 1f) }
        ExifInterface.ORIENTATION_ROTATE_270 -> setRotate(-90f)
      }
    }
    var result: Bitmap? = null
    try {
      result = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
      val output = ByteArrayOutputStream()
      val rgb = Bitmap.createBitmap(result.width, result.height, Bitmap.Config.ARGB_8888, false, ColorSpace.get(ColorSpace.Named.SRGB))
      try {
        Canvas(rgb).apply { drawColor(Color.WHITE); drawBitmap(result, 0f, 0f, null) }
        if (!rgb.compress(Bitmap.CompressFormat.JPEG, 90, output)) throw IOException("Photo cannot be encoded")
      } finally { rgb.recycle() }
      val bytes = stripEncodedJpegMetadata(output.toByteArray())
      validateSanitizedJpeg(bytes, result.width, result.height)
      if (bytes.size > 20 * 1024 * 1024) throw IOException("Photo exceeds supported size")
      return SanitizedPhoto(bytes, result.width, result.height)
    } finally { if (result != null && result !== bitmap) result.recycle(); bitmap.recycle() }
  }
}

/** Validate sanitized JPEG structure, dimensions and prohibited metadata before any durable write. */
internal fun validateSanitizedJpeg(bytes: ByteArray, width: Int, height: Int) {
  fun u(i: Int) = bytes[i].toInt() and 255
  if (bytes.size < 12 || u(0) != 255 || u(1) != 216 || u(bytes.lastIndex - 1) != 255 || u(bytes.lastIndex) != 217) throw IOException("Invalid JPEG photo")
  var offset = 2; var foundDimensions = false; var foundScan = false
  while (offset + 1 < bytes.size) {
    if (u(offset) != 255) throw IOException("Invalid JPEG marker")
    while (offset < bytes.size && u(offset) == 255) offset++
    if (offset >= bytes.size) break
    val marker = u(offset++)
    if (marker == 217) { if (offset != bytes.size) throw IOException("Trailing JPEG metadata"); break }
    if (marker in 208..215 || marker == 1) continue
    if (offset + 1 >= bytes.size) throw IOException("Invalid JPEG marker")
    val length = u(offset) * 256 + u(offset + 1)
    if (length < 2 || offset + length > bytes.size) throw IOException("Invalid JPEG segment")
    if (marker == 224 && (length != 16 || u(offset + 2) != 74 || u(offset + 3) != 70 || u(offset + 4) != 73 || u(offset + 5) != 70 || u(offset + 6) != 0 || u(offset + 14) != 0 || u(offset + 15) != 0)) throw IOException("Noncanonical JPEG application metadata")
    if (marker in 225..239 || marker == 254) throw IOException("Photo metadata is not scrubbed")
    if (marker in listOf(192, 193, 194)) {
      if (length < 8 || u(offset + 2) != 8 || u(offset + 7) !in listOf(1, 3) || length != 8 + 3 * u(offset + 7) || u(offset + 3) * 256 + u(offset + 4) != height || u(offset + 5) * 256 + u(offset + 6) != width) throw IOException("Photo dimensions disagree")
      foundDimensions = true
    }
    offset += length
    if (marker == 218) {
      foundScan = true
      while (offset + 1 < bytes.size) {
        if (u(offset) != 255) { offset++; continue }
        val next = u(offset + 1)
        if (next == 0 || next in 208..215) { offset += 2; continue }
        if (next == 255) { offset++; continue }
        break
      }
    }
  }
  if (!foundDimensions || !foundScan) throw IOException("Invalid JPEG photo")
}

/** Incoming canonical photos keep their bytes; a real decoder must also accept their pixels. */
internal fun validateDecodedSanitizedJpeg(bytes: ByteArray, width: Int, height: Int) {
  if (bytes.size > 20 * 1024 * 1024) throw IOException("Photo exceeds supported size")
  validateSanitizedJpeg(bytes, width, height)
  val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
  BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
  if (bounds.outWidth != width || bounds.outHeight != height || bounds.outMimeType != "image/jpeg") throw IOException("Photo pixels disagree with metadata")
  var sample = 1
  while ((width / sample).toLong() * (height / sample) > 4_194_304L) sample *= 2
  val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: throw IOException("Photo pixels cannot be decoded")
  bitmap.recycle()
}

/** Only picker output is canonicalized; imported canonical entity bytes are never rewritten. */
internal fun stripEncodedJpegMetadata(bytes: ByteArray): ByteArray {
  fun u(i: Int) = bytes[i].toInt() and 255
  if (bytes.size < 4 || u(0) != 255 || u(1) != 216) throw IOException("Invalid JPEG encoder output")
  val output = ByteArrayOutputStream(); output.write(bytes, 0, 2)
  var offset = 2
  while (offset + 1 < bytes.size) {
    val start = offset
    if (u(offset) != 255) throw IOException("Invalid JPEG encoder marker")
    while (offset < bytes.size && u(offset) == 255) offset++
    if (offset >= bytes.size) throw IOException("Incomplete JPEG encoder marker")
    val marker = u(offset++)
    if (marker == 217) { if (offset != bytes.size) throw IOException("Trailing JPEG encoder output"); output.write(bytes, start, offset - start); return output.toByteArray() }
    if (marker in 208..215 || marker == 1) { output.write(bytes, start, offset - start); continue }
    if (offset + 1 >= bytes.size) throw IOException("Invalid JPEG encoder segment")
    val length = u(offset) * 256 + u(offset + 1)
    if (length < 2 || offset + length > bytes.size) throw IOException("Invalid JPEG encoder segment")
    val canonicalJfif = marker == 224 && length == 16 && u(offset + 2) == 74 && u(offset + 3) == 70 && u(offset + 4) == 73 && u(offset + 5) == 70 && u(offset + 6) == 0 && u(offset + 14) == 0 && u(offset + 15) == 0
    val keep = marker !in 224..239 && marker != 254 || canonicalJfif
    offset += length
    if (keep) output.write(bytes, start, offset - start)
    if (marker == 218) {
      val scanStart = offset
      while (offset + 1 < bytes.size) {
        if (u(offset) != 255) { offset++; continue }
        val next = u(offset + 1)
        if (next == 0 || next in 208..215) { offset += 2; continue }
        if (next == 255) { offset++; continue }
        break
      }
      output.write(bytes, scanStart, offset - scanStart)
    }
  }
  throw IOException("Incomplete JPEG encoder output")
}
