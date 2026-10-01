package com.zzzode.leanon.container

import android.content.Context
import com.lynx.tasm.provider.AbsTemplateProvider
import java.io.ByteArrayOutputStream
import java.io.IOException

/**
 * Loads Lynx bundles packaged in the app's `assets` directory. The bundle is
 * staged there from `packages/pages/dist` by the Gradle build.
 */
class AssetsTemplateProvider(context: Context) : AbsTemplateProvider() {

  private val appContext: Context = context.applicationContext

  override fun loadTemplate(uri: String, callback: Callback) {
    Thread {
      try {
        appContext.assets.open(uri).use { input ->
          ByteArrayOutputStream().use { out ->
            val buffer = ByteArray(1024)
            var read: Int
            while (input.read(buffer).also { bytes -> read = bytes } != -1) {
              out.write(buffer, 0, read)
            }
            callback.onSuccess(out.toByteArray())
          }
        }
      } catch (e: IOException) {
        callback.onFailed(e.message)
      }
    }.start()
  }
}
