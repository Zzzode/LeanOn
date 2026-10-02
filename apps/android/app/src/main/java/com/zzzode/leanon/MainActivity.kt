package com.zzzode.leanon

import android.os.Bundle
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import com.zzzode.leanon.ble.PermissionRequests
import com.zzzode.leanon.container.LynxContainer
import com.zzzode.leanon.reminders.NotificationPermission
import com.zzzode.leanon.healthconnect.HealthConnectPermission

/** Single-activity shell that hosts the reusable Lynx container. */
class MainActivity : AppCompatActivity() {

  private lateinit var container: LynxContainer

  // Registered before STARTED; Health Connect returns the granted permission set here.
  val healthConnectPermissionLauncher =
    registerForActivityResult(HealthConnectPermission.contract) { grantedPermissions ->
      HealthConnectPermission.handleResult(grantedPermissions)
    }

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

  override fun onStart() {
    super.onStart()
    // Best-effort two-way sync whenever the app comes to the foreground (RFC 0025).
    val app = application as LeanOnApplication
    if (app.settings.getHealthConnectEnabled()) {
      app.healthConnect.syncAsync { }
    }
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray,
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    PermissionRequests.handleResult(requestCode, grantResults)
    NotificationPermission.handleResult(requestCode, grantResults)
  }

  override fun onDestroy() {
    container.detach()
    super.onDestroy()
  }
}
