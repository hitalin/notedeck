package com.notedeck.desktop

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    scheduleNotificationPolling()
  }

  private fun scheduleNotificationPolling() {
    val constraints = Constraints.Builder()
      .setRequiredNetworkType(NetworkType.CONNECTED)
      .build()

    val request = PeriodicWorkRequestBuilder<NotificationWorker>(
      15, TimeUnit.MINUTES,
    )
      .setConstraints(constraints)
      .build()

    WorkManager.getInstance(this).enqueueUniquePeriodicWork(
      "notedeck_notification_poll",
      ExistingPeriodicWorkPolicy.KEEP,
      request,
    )
  }
}
