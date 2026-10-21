package com.zzzode.leanon.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.work.WorkManager
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import java.util.concurrent.TimeUnit
import java.util.concurrent.Executors

/** Existing relative delays must be recalculated after the system local clock changes. */
class ReminderClockReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action !in setOf(Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED)) return
    val result = goAsync()
    executor.execute {
      try {
        WorkManager.getInstance(context).enqueueUniqueWork("reminder-clock-reconcile", ExistingWorkPolicy.REPLACE,
          OneTimeWorkRequestBuilder<ReminderClockWorker>().build()).result.get(5, TimeUnit.SECONDS)
      } catch (error: Exception) { Log.w("LeanOn", "Reminder clock reconciliation unavailable", error) }
      finally { result.finish() }
    }
  }
  private companion object { val executor = Executors.newSingleThreadExecutor() }
}
