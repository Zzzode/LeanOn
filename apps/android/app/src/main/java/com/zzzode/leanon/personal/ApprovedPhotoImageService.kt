package com.zzzode.leanon.personal

import android.content.Context
import com.lynx.service.image.LynxImageService
import com.lynx.tasm.image.model.AnimationListener
import com.lynx.tasm.image.model.ImageLoadListener
import com.lynx.tasm.image.model.ImageRequestInfo
import com.lynx.tasm.service.ILynxImageService
import java.io.IOException

/** The official image renderer is exposed only for issued, current private photo previews. */
internal class ApprovedPhotoImageService(
  private val approved: (String) -> Boolean,
  private val deliver: (String, () -> Unit) -> Boolean,
  private val delegate: ILynxImageService = LynxImageService.getInstance(),
) : ILynxImageService by delegate {
  override fun canParseUrl(url: String): Boolean = approved(url)
  override fun fetchImage(info: ImageRequestInfo, listener: ImageLoadListener, animation: AnimationListener?, context: Context) {
    if (approved(info.url)) delegate.fetchImage(info, guarded(info, listener), animation, context)
    else listener.onFailure(-1, IOException("Photo preview authorization expired"))
  }
  override fun decodeImage(info: ImageRequestInfo, listener: ImageLoadListener) {
    if (approved(info.url)) delegate.decodeImage(info, guarded(info, listener))
    else listener.onFailure(-1, IOException("Photo preview authorization expired"))
  }
  override fun prefetchImage(url: String, caller: Any?, options: MutableMap<String, Any>?) {
    // Private previews are decoded only for an explicitly mounted image.
  }
  override fun prefetchImage(url: String, caller: Any?, options: MutableMap<String, Any>?, listener: ImageLoadListener?) {
    listener?.onFailure(-1, IOException("Private photo prefetch is disabled"))
  }
  private fun guarded(request: ImageRequestInfo, target: ImageLoadListener) = object : ImageLoadListener by target {
    override fun onSuccess(content: com.lynx.tasm.image.ImageContent?, info: ImageRequestInfo, imageInfo: com.lynx.tasm.image.model.ImageInfo) {
      if (!deliver(request.url) { target.onSuccess(content, info, imageInfo) }) {
        delegate.releaseImage(request)
        target.onFailure(-1, IOException("Photo preview authorization expired"))
      }
    }
  }
}
