package com.notedeck.desktop

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

class MainActivity : TauriActivity() {
  companion object {
    private const val NOTIFICATION_PERMISSION_CODE = 42
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    requestNotificationPermission()
    scheduleNotificationPolling()
  }

  private fun requestNotificationPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      if (ContextCompat.checkSelfPermission(
          this,
          Manifest.permission.POST_NOTIFICATIONS
        ) != PackageManager.PERMISSION_GRANTED
      ) {
        ActivityCompat.requestPermissions(
          this,
          arrayOf(Manifest.permission.POST_NOTIFICATIONS),
          NOTIFICATION_PERMISSION_CODE
        )
      }
    }
  }

  private fun scheduleNotificationPolling() {
    val constraints = Constraints.Builder()
      .setRequiredNetworkType(NetworkType.CONNECTED)
      .setRequiresBatteryNotLow(true)
      .build()

    val request = PeriodicWorkRequestBuilder<NotificationWorker>(
      15, TimeUnit.MINUTES,
    )
      .setConstraints(constraints)
      .setBackoffCriteria(
        BackoffPolicy.EXPONENTIAL,
        15,
        TimeUnit.MINUTES
      )
      .build()

    WorkManager.getInstance(this).enqueueUniquePeriodicWork(
      "notedeck_notification_poll",
      ExistingPeriodicWorkPolicy.KEEP,
      request,
    )
  }
}
