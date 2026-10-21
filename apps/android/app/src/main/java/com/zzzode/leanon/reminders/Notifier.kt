package com.zzzode.leanon.reminders

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.app.PendingIntent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.zzzode.leanon.MainActivity
import com.zzzode.leanon.R

/** Builds the reminder channel and posts the daily notifications (RFC 0020). */
class Notifier(context: Context) {

  private val appContext = context.applicationContext

  init {
    createChannel()
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        appContext.getString(R.string.notif_channel_name),
        NotificationManager.IMPORTANCE_HIGH,
      )
      val manager =
        appContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(channel)
    }
  }

  /** Post the reminder for [kind]; tap opens LeanOn. */
  fun post(kind: String) {
    if (!NotificationPermission.areGranted(appContext)) return
    val titleRes: Int
    val bodyRes: Int
    when (kind) {
      ReminderDecision.KIND_WEIGHT -> {
        titleRes = R.string.notif_weight_title
        bodyRes = R.string.notif_weight_body
      }
      else -> {
        titleRes = R.string.notif_meals_title
        bodyRes = R.string.notif_meals_body
      }
    }

    val intent = Intent(appContext, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val pendingIntent = PendingIntent.getActivity(
      appContext,
      notificationId(kind),
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    val notification = NotificationCompat.Builder(appContext, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(appContext.getString(titleRes))
      .setContentText(appContext.getString(bodyRes))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(pendingIntent)
      .build()

    try {
      NotificationManagerCompat.from(appContext)
        .notify(notificationId(kind), notification)
    } catch (error: SecurityException) {
      // A background worker can lose its grant between the check and notify.
      Log.w("Notifier", "Notification permission was revoked before posting", error)
    }
  }

  companion object {
    const val CHANNEL_ID = "reminders"

    fun notificationId(kind: String): Int =
      if (kind == ReminderDecision.KIND_WEIGHT) 1001 else 1002
  }
}
