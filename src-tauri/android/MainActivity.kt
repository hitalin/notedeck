package com.notedeck.desktop

import android.Manifest
import android.app.DownloadManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.view.ContextMenu
import android.view.View
import android.webkit.WebView
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

  override fun onWebViewCreate(webView: WebView) {
    webView.isLongClickable = true
    registerForContextMenu(webView)
  }

  override fun onCreateContextMenu(
    menu: ContextMenu,
    v: View,
    menuInfo: ContextMenu.ContextMenuInfo?
  ) {
    super.onCreateContextMenu(menu, v, menuInfo)
    if (v !is WebView) return
    val result = v.hitTestResult
    when (result.type) {
      WebView.HitTestResult.IMAGE_TYPE,
      WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE -> {
        val url = result.extra ?: return
        menu.setHeaderTitle("画像")
        menu.add("ダウンロード").setOnMenuItemClickListener {
          val request = DownloadManager.Request(Uri.parse(url)).apply {
            setNotificationVisibility(
              DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
            )
            setDestinationInExternalPublicDir(
              Environment.DIRECTORY_DOWNLOADS,
              url.substringAfterLast('/').substringBefore('?')
            )
          }
          (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
          true
        }
        menu.add("共有").setOnMenuItemClickListener {
          startActivity(Intent.createChooser(
            Intent(Intent.ACTION_SEND).apply {
              type = "text/plain"
              putExtra(Intent.EXTRA_TEXT, url)
            },
            null
          ))
          true
        }
        menu.add("ブラウザで開く").setOnMenuItemClickListener {
          startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
          true
        }
      }
      else -> {}
    }
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
