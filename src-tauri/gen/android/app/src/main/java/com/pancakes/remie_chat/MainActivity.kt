package com.pancakes.remie_chat

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

import android.os.Build
import android.app.PictureInPictureParams
import android.content.Intent
import android.net.Uri
import android.provider.Settings

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Person
import android.content.Context
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    
    // Force dark icons for status bar and navigation bar (light background)
    val controller = androidx.core.view.WindowInsetsControllerCompat(window, window.decorView)
    controller.isAppearanceLightStatusBars = true
    controller.isAppearanceLightNavigationBars = true
    
    // Fix keyboard pushing up the entire WebView
    androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
        val imeHeight = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.ime()).bottom
        val navHeight = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.navigationBars()).bottom
        view.setPadding(0, 0, 0, Math.max(imeHeight, navHeight))
        insets
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 101)
    }
    if (!Settings.canDrawOverlays(this)) {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:$packageName")
        )
        startActivityForResult(intent, 1234)
    }
  }

  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    if (Settings.canDrawOverlays(this)) {
        val serviceIntent = Intent(this, FloatingWidgetService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }
    }
  }
}
