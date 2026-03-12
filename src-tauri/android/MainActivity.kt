package com.notedeck.desktop

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.enableEdgeToEdge

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
}
