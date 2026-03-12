package com.notedeck.desktop

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    startStreamingService()
  }

  private fun startStreamingService() {
    val intent = Intent(this, StreamingService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      startForegroundService(intent)
    } else {
      startService(intent)
    }
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
