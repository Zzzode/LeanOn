package com.zzzode.leanon

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.util.Log
import android.widget.LinearLayout
import androidx.annotation.RequiresApi

/** Samples fixed tab coordinates; only the curved rim bends the content. */
internal class TabBarRefractionStrip(context: Context) : LinearLayout(context) {
  private val optics = if (Build.VERSION.SDK_INT >= 33) {
    try {
      RimShader(resources.displayMetrics.density)
    } catch (error: IllegalArgumentException) {
      Log.w("TabBarRefractionStrip", "Rim shader unavailable; using native tabs", error)
      null
    }
  } else null
  private var source: Bitmap? = null
  private var sourceDirty = true
  private var pressure = 0f

  fun invalidateOpticalSource() {
    sourceDirty = true
    invalidate()
  }

  fun setLens(centerX: Float, centerY: Float, width: Float, height: Float,
              scaleX: Float, scaleY: Float, pressure: Float) {
    this.pressure = pressure.coerceIn(0f, 1f)
    if (Build.VERSION.SDK_INT >= 33) {
      optics?.setLens(centerX, centerY, width, height, scaleX, scaleY, this.pressure)
    }
    if (optics != null) invalidate()
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    sourceDirty = true
  }

  override fun dispatchDraw(canvas: Canvas) {
    if (Build.VERSION.SDK_INT < 33 || optics == null || !canvas.isHardwareAccelerated ||
        pressure <= 0.001f || width == 0 || height == 0) {
      super.dispatchDraw(canvas)
      return
    }
    var bitmap = source
    if (bitmap == null || bitmap.width != width || bitmap.height != height) {
      // Do not recycle a bitmap that may still be referenced by a render-thread frame.
      bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
      source = bitmap
      sourceDirty = true
    }
    if (sourceDirty) {
      bitmap.eraseColor(Color.TRANSPARENT)
      super.dispatchDraw(Canvas(bitmap))
      optics.setSource(bitmap)
      sourceDirty = false
    }
    optics.draw(canvas, width.toFloat(), height.toFloat())
  }

  override fun onDetachedFromWindow() {
    source = null
    sourceDirty = true
    if (Build.VERSION.SDK_INT >= 33) optics?.clearSource()
    super.onDetachedFromWindow()
  }

  @RequiresApi(33)
  private class RimShader(density: Float) {
    private val shader = RuntimeShader(SOURCE)
    private val paint = Paint().apply { this.shader = this@RimShader.shader }

    init {
      shader.setFloatUniform("bandWidth", 18f * density)
      shader.setFloatUniform("outerWidth", 4f * density)
      shader.setFloatUniform("bend", 8f * density)
      shader.setFloatUniform("dispersion", 1.4f * density)
      shader.setColorUniform("outerMaterial", Color.rgb(250, 253, 251))
    }

    fun setSource(bitmap: Bitmap) {
      val input = BitmapShader(bitmap, Shader.TileMode.DECAL, Shader.TileMode.DECAL)
      input.setFilterMode(BitmapShader.FILTER_MODE_LINEAR)
      shader.setInputShader("tabs", input)
    }

    fun clearSource() {
      // Release the full tab bitmap without invalidating in-flight draw commands.
      shader.setInputShader("tabs", android.graphics.LinearGradient(
        0f, 0f, 1f, 0f, Color.TRANSPARENT, Color.TRANSPARENT, Shader.TileMode.CLAMP))
    }

    fun setLens(x: Float, y: Float, width: Float, height: Float,
                scaleX: Float, scaleY: Float, pressure: Float) {
      shader.setFloatUniform("center", x, y)
      shader.setFloatUniform("halfSize", width / 2f, height / 2f)
      shader.setFloatUniform("scale", scaleX, scaleY)
      shader.setFloatUniform("pressure", pressure)
      // Follow the gray resting overlay as it reveals the clear lens, so
      // dispersing glyph coverage does not leave a white halo during release.
      shader.setColorUniform("material", Color.rgb(
        (230f + 20f * pressure).toInt(), (236f + 17f * pressure).toInt(),
        (232f + 19f * pressure).toInt()))
    }

    fun draw(canvas: Canvas, width: Float, height: Float) {
      canvas.drawRect(0f, 0f, width, height, paint)
    }

    companion object {
      private const val SOURCE = """
        uniform shader tabs;
        uniform float2 center;
        uniform float2 halfSize;
        uniform float2 scale;
        uniform float pressure;
        uniform float bandWidth;
        uniform float outerWidth;
        uniform float bend;
        uniform float dispersion;
        layout(color) uniform half4 material;
        layout(color) uniform half4 outerMaterial;

        half4 main(float2 point) {
          half4 original = tabs.eval(point);
          float2 local = (point - center) / scale;
          float radius = min(halfSize.x, halfSize.y);
          float2 q = abs(local) - halfSize + radius;
          float2 corner = max(q, 0.0);
          float distance = length(corner) + min(max(q.x, q.y), 0.0) - radius;
          float2 localNormal = length(corner) > 0.001 ? normalize(corner) :
            (q.x > q.y ? float2(1.0, 0.0) : float2(0.0, 1.0));
          float2 gradient = localNormal * sign(local) / scale;
          float depth = -distance / max(length(gradient), 0.001);
          // The curved rim reaches slightly outside the silhouette and farther
          // into the lens, tapering to identity before the stable center.
          float profile = smoothstep(-outerWidth, bandWidth * 0.15, depth) *
            (1.0 - smoothstep(bandWidth * 0.25, bandWidth, depth)) * pressure;
          if (profile <= 0.001) return original;
          float2 normal = normalize(gradient);
          float2 refracted = point - normal * bend * profile;
          float2 split = normal * dispersion * profile;
          half4 red = tabs.eval(refracted + split);
          half4 green = tabs.eval(refracted);
          half4 blue = tabs.eval(refracted - split);
          half alpha = max(red.a, max(green.a, blue.a));
          // Outside the lens there is no gray resting overlay. Blend across
          // one pixel at the silhouette, instead of carrying its tint outward.
          half3 backdrop = mix(outerMaterial.rgb, material.rgb,
            half(smoothstep(0.0, 1.0, depth)));
          // Each channel sees the material through its own coverage. Keep the
          // result premultiplied so thin glyph edges have no dark/opaque halo.
          half3 rgb = half3(red.r, green.g, blue.b) +
            (half3(alpha) - half3(red.a, green.a, blue.a)) * backdrop;
          return half4(clamp(rgb, half3(0.0), half3(alpha)), alpha);
        }
      """
    }
  }
}
