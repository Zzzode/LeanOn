package com.zzzode.leanon

import android.os.Bundle
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import com.zzzode.leanon.container.LynxContainer

/** Single-activity shell that hosts the reusable Lynx container. */
class MainActivity : AppCompatActivity() {

  private lateinit var container: LynxContainer

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val root = FrameLayout(this)
    setContentView(root)

    val app = application as LeanOnApplication
    container = LynxContainer(
      activity = this,
      capabilities = app.capabilities,
      resourceProvider = app.resourceProvider,
      events = app.events,
      records = app.records,
    )
    container.attach(root)
    container.loadRoute("home")
  }

  override fun onDestroy() {
    container.detach()
    super.onDestroy()
  }
}
