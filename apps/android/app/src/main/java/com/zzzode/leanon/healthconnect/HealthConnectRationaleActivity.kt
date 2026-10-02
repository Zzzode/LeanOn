package com.zzzode.leanon.healthconnect

import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * Explains why LeanOn requests Health Connect write permissions. Shown by the
 * platform rationale flow (pre-Android 14) and via the permission-usage link
 * on Android 14+. Kept framework-light: the view is built in code.
 */
class HealthConnectRationaleActivity : AppCompatActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val padding = (24 * resources.displayMetrics.density).toInt()
    val textView = TextView(this).apply {
      text = getString(
        com.zzzode.leanon.R.string.health_connect_rationale,
      )
      setPadding(padding, padding, padding, padding)
      gravity = Gravity.START or Gravity.TOP
      setTextColor(0xFF16261F.toInt())
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
    }
    setContentView(textView)
  }
}
