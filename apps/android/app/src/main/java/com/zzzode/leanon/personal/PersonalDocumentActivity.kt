package com.zzzode.leanon.personal

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.zzzode.leanon.bridge.PendingRequest

internal sealed interface DocumentSelection {
  data object Cancelled : DocumentSelection
  data class Selected(val uri: Uri) : DocumentSelection
  data object Unavailable : DocumentSelection
}
/** Explicit SAF selection only: no camera or broad media permission request exists here. */
internal object PersonalDocuments {
  private val pending = PendingRequest<DocumentSelection>()
  fun launch(host: Activity, exportName: String? = null, image: Boolean = false, callback: (DocumentSelection) -> Unit): Boolean {
    if (!pending.begin(callback)) return false
    if (host.isFinishing || host.isDestroyed) { pending.complete(DocumentSelection.Unavailable); return true }
    try { host.startActivity(Intent(host, PersonalDocumentActivity::class.java).putExtra("image", image).putExtra("exportName", exportName)) }
    catch (_: Exception) { pending.complete(DocumentSelection.Unavailable) }
    return true
  }
  fun deliver(result: DocumentSelection) { pending.complete(result) }
}
class PersonalDocumentActivity : AppCompatActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (savedInstanceState != null) return
    val exportName = intent.getStringExtra("exportName")
    val picker = Intent(if (exportName == null) Intent.ACTION_OPEN_DOCUMENT else Intent.ACTION_CREATE_DOCUMENT)
      .addCategory(Intent.CATEGORY_OPENABLE)
      .setType(if (intent.getBooleanExtra("image", false)) "image/*" else "application/json")
    if (exportName != null) picker.putExtra(Intent.EXTRA_TITLE, exportName)
    try { @Suppress("DEPRECATION") startActivityForResult(picker, 71) }
    catch (_: Exception) { PersonalDocuments.deliver(DocumentSelection.Unavailable); finish() }
  }
  @Deprecated("Platform SAF result compatibility")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode != 71) return
    val uri = data?.data
    PersonalDocuments.deliver(if (resultCode == Activity.RESULT_OK && uri != null) DocumentSelection.Selected(uri) else DocumentSelection.Cancelled)
    finish()
  }
  override fun onDestroy() {
    if (isFinishing) PersonalDocuments.deliver(DocumentSelection.Cancelled)
    super.onDestroy()
  }
}
