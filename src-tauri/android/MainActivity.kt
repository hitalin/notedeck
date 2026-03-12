package com.notedeck.desktop

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    startStreamingService()
    requestBatteryOptimizationExemption()
  }

  private fun startStreamingService() {
    val intent = Intent(this, StreamingService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      startForegroundService(intent)
    } else {
      startService(intent)
    }
  }

  private fun requestBatteryOptimizationExemption() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return

    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    if (pm.isIgnoringBatteryOptimizations(packageName)) return

    val prefs = getSharedPreferences("notedeck", Context.MODE_PRIVATE)
    if (prefs.getBoolean("battery_optimization_asked", false)) return

    prefs.edit().putBoolean("battery_optimization_asked", true).apply()

    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
      data = Uri.parse("package:$packageName")
    }
    startActivity(intent)
  }

  override fun onWebViewCreate(webView: WebView) {
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      val density = view.resources.displayMetrics.density
      val topDp = bars.top / density
      val bottomDp = bars.bottom / density
      webView.evaluateJavascript(
        "document.documentElement.style.setProperty('--nd-safe-area-top','${topDp}px');" +
        "document.documentElement.style.setProperty('--nd-safe-area-bottom','${bottomDp}px');",
        null
      )
      insets
    }
  }
}
