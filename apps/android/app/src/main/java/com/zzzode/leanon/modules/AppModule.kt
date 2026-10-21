package com.zzzode.leanon.modules

import android.content.Context
import android.content.ContextWrapper
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.react.bridge.ReadableMap
import com.zzzode.leanon.LeanOnApplication
import com.zzzode.leanon.MainActivity
import com.zzzode.leanon.appearance.readAppearancePreference

/** Native module backing the `app.*` methods. */
class AppModule(context: Context) : LynxModule(context) {
  private val modalOwner = Any()

  @LynxMethod
  @Suppress("UNUSED_PARAMETER")
  fun getInfo(params: ReadableMap?, callback: Callback) {
    callback.invoke(
      mapOf(
        "platform" to "android",
        "hostVersion" to "0.1.0",
        "osVersion" to Build.VERSION.RELEASE,
        "deviceModel" to Build.MODEL,
      ),
    )
  }

  @LynxMethod
  @Suppress("UNUSED_PARAMETER")
  fun getAppearance(params: ReadableMap?, callback: Callback) {
    val app = mContext.applicationContext as LeanOnApplication
    callback.invoke(JavaOnlyMap.from(app.appearance.snapshot()))
  }

  @LynxMethod
  fun setAppearance(params: ReadableMap, callback: Callback) {
    val requested = readAppearancePreference(params)?.value
    if (requested == null) {
      callback.invoke(mapOf("code" to "invalid-request", "message" to "Unsupported appearance"))
      return
    }
    val app = mContext.applicationContext as LeanOnApplication
    Handler(Looper.getMainLooper()).post {
      if (!app.appearance.save(requested)) {
        callback.invoke(mapOf("code" to "unavailable", "message" to "Could not save appearance"))
        return@post
      }
      // Commit before event/acknowledgement. Mounted pages and a process
      // restart must agree on the same preference, including system mode.
      app.appearance.applyPlatformPreference()
      findActivity()?.applyAppearance()
      val appearance = app.appearance.snapshot()
      app.events.dispatch("app.appearanceChanged", appearance)
      callback.invoke(JavaOnlyMap.from(mapOf("success" to true) + appearance))
    }
  }

  private fun findActivity(): MainActivity? {
    var context: Context = mContext
    while (context is ContextWrapper && context !is MainActivity) {
      val next = context.baseContext
      if (next === context) break
      context = next
    }
    return context as? MainActivity
  }

  @LynxMethod
  @Suppress("UNUSED_PARAMETER")
  fun getCapabilities(params: ReadableMap?, callback: Callback) {
    val app = mContext.applicationContext as LeanOnApplication
    val caps = app.capabilities
    callback.invoke(
      mapOf(
        "bridgeVersion" to caps.bridgeVersion,
        "supportedMethods" to caps.supportedMethods,
        "supportedEvents" to caps.supportedEvents,
      ),
    )
  }

  @LynxMethod
  fun openRoute(params: ReadableMap, callback: Callback) {
    val app = mContext.applicationContext as LeanOnApplication
    val route = params.getString("route")
    Handler(Looper.getMainLooper()).post {
      val opened = route != null && app.router.open(route)
      callback.invoke(mapOf("success" to opened))
    }
  }

  @LynxMethod
  fun setLocale(params: ReadableMap, callback: Callback) {
    val locale = params.getString("locale")
    if (locale !in SUPPORTED_LOCALES) {
      callback.invoke(mapOf("code" to "invalid-request", "message" to "Unsupported locale"))
      return
    }
    val app = mContext.applicationContext as LeanOnApplication
    // Commit before announcing the change so subsequent routes and a process
    // restart agree with every already mounted Lynx view.
    val saved = app.getSharedPreferences(LOCALE_PREFERENCES, Context.MODE_PRIVATE)
      .edit().putString(LOCALE_KEY, locale).commit()
    if (!saved) {
      callback.invoke(mapOf("code" to "unavailable", "message" to "Could not save locale"))
      return
    }
    val mainHandler = Handler(Looper.getMainLooper())
    mainHandler.post {
      app.events.dispatch("app.localeChanged", mapOf("locale" to locale))
      callback.invoke(mapOf("success" to true, "locale" to locale))
      // Acknowledge this module's request before locale configuration recreates
      // its activity. New Lynx views restore the same committed preference.
      mainHandler.post {
        if (preferredLocale(app) == locale) {
          val locales = LocaleListCompat.forLanguageTags(locale)
          if (AppCompatDelegate.getApplicationLocales() != locales) {
            AppCompatDelegate.setApplicationLocales(locales)
          }
        }
      }
    }
  }

  @LynxMethod
  fun setModalActive(params: ReadableMap, callback: Callback) {
    val active = params.getBoolean("active")
    var context: Context = mContext
    while (context is ContextWrapper && context !is MainActivity) {
      val next = context.baseContext
      if (next === context) break
      context = next
    }
    val activity = context as? MainActivity
    activity?.runOnUiThread {
      if (activity.isFinishing || activity.isDestroyed) {
        callback.invoke(mapOf("code" to "unavailable", "message" to "No active host"))
      } else {
        try { callback.invoke(mapOf("success" to activity.setModalActive(active, modalOwner))) }
        catch (_: java.io.IOException) {
          callback.invoke(mapOf("code" to "unavailable", "message" to "Photo preview cleanup unavailable; access revoked"))
        }
      }
    } ?: callback.invoke(mapOf("code" to "unavailable", "message" to "No active host"))
  }

  companion object {
    private const val LOCALE_PREFERENCES = "leanon-locale"
    private const val LOCALE_KEY = "locale"
    private val SUPPORTED_LOCALES = setOf("en", "zh-CN")

    fun preferredLocale(context: Context): String? =
      context.applicationContext.getSharedPreferences(LOCALE_PREFERENCES, Context.MODE_PRIVATE)
        .getString(LOCALE_KEY, null)?.takeIf { it in SUPPORTED_LOCALES }
  }
}
