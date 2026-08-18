package com.pancakes.remie_chat

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import pl.droidsonroids.gif.GifImageView
import android.os.Handler
import android.os.Looper

class FloatingWidgetService : Service() {
    private lateinit var windowManager: WindowManager
    private lateinit var floatingView: GifImageView
    private var dismissView: View? = null
    
    private val typingHandler = Handler(Looper.getMainLooper())
    private val revertTypingRunnable = Runnable {
        if (::floatingView.isInitialized) {
            floatingView.setImageResource(R.raw.remie_waiting_input)
        }
    }

    private var dismissZoneCentreX: Int = 0
    private var dismissZoneCentreY: Int = 0
    private val SNAP_THRESHOLD = 150

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        stopSelf()
        android.os.Process.killProcess(android.os.Process.myPid())
    }

    override fun onCreate() {
        super.onCreate()
        startForegroundService()

        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager

        floatingView = GifImageView(this)
        floatingView.setImageResource(R.raw.remie_waiting_input)

        val layoutFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            WindowManager.LayoutParams.TYPE_PHONE

        val params = WindowManager.LayoutParams(
            200, 200,
            layoutFlag,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT
        )
        params.gravity = Gravity.TOP or Gravity.START
        params.x = 0
        params.y = 100

        windowManager.addView(floatingView, params)

        floatingView.setOnTouchListener(object : View.OnTouchListener {
            private var initialX = 0
            private var initialY = 0
            private var initialTouchX = 0f
            private var initialTouchY = 0f
            private var isClick = true
            private var inDismissZone = false

            override fun onTouch(v: View, event: MotionEvent): Boolean {
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        initialX = params.x
                        initialY = params.y
                        initialTouchX = event.rawX
                        initialTouchY = event.rawY
                        isClick = true
                        inDismissZone = false
                        floatingView.setImageResource(R.raw.remie_thinking)
                        return true
                    }

                    MotionEvent.ACTION_MOVE -> {
                        val dx = (event.rawX - initialTouchX).toInt()
                        val dy = (event.rawY - initialTouchY).toInt()

                        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                            if (isClick) {
                                isClick = false
                                showDismissZone()
                            }
                        }

                        val newX = initialX + dx
                        val newY = initialY + dy

                        if (dismissView != null) {
                            val bubbleCentreX = newX + 100
                            val bubbleCentreY = newY + 100
                            
                            val distSq = Math.pow((bubbleCentreX - dismissZoneCentreX).toDouble(), 2.0) + 
                                         Math.pow((bubbleCentreY - dismissZoneCentreY).toDouble(), 2.0)
                            
                            if (Math.sqrt(distSq) < SNAP_THRESHOLD) {
                                params.x = dismissZoneCentreX - 100
                                params.y = dismissZoneCentreY - 100
                                inDismissZone = true
                                highlightDismissZone(true)
                            } else {
                                params.x = newX
                                params.y = newY
                                inDismissZone = false
                                highlightDismissZone(false)
                            }
                        } else {
                            params.x = newX
                            params.y = newY
                        }

                        windowManager.updateViewLayout(floatingView, params)
                        return true
                    }

                    MotionEvent.ACTION_UP -> {
                        hideDismissZone()
                        if (isClick) {
                            val intent = Intent(this@FloatingWidgetService, MainActivity::class.java)
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                            startActivity(intent)
                            stopSelf()
                        } else if (inDismissZone) {
                            stopSelf()
                            // Only kill the bubble, do not kill the app process
                        } else {
                            val metrics = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                                windowManager.currentWindowMetrics.bounds
                            } else {
                                val display = windowManager.defaultDisplay
                                android.graphics.Rect(0, 0, display.width, display.height)
                            }
                            val screenWidth = metrics.width()
                            val targetX = if (params.x + 100 < screenWidth / 2) {
                                0
                            } else {
                                screenWidth - 200
                            }
                            
                            val animator = android.animation.ValueAnimator.ofInt(params.x, targetX)
                            animator.duration = 300 // 300ms for a soft, smooth snap
                            animator.interpolator = android.view.animation.DecelerateInterpolator()
                            animator.addUpdateListener { animation ->
                                params.x = animation.animatedValue as Int
                                windowManager.updateViewLayout(floatingView, params)
                            }
                            animator.start()
                        }
                        floatingView.setImageResource(R.raw.remie_waiting_input)
                        return true
                    }
                    
                    MotionEvent.ACTION_OUTSIDE -> {
                        // User touched outside the bubble (e.g. typing)
                        floatingView.setImageResource(R.raw.user_typing)
                        typingHandler.removeCallbacks(revertTypingRunnable)
                        typingHandler.postDelayed(revertTypingRunnable, 1000)
                        return false
                    }
                }
                return false
            }
        })
    }

    private fun showDismissZone() {
        if (dismissView != null) return

        val layoutFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            WindowManager.LayoutParams.TYPE_PHONE

        // WindowMetrics is the modern replacement for defaultDisplay
        val metrics = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            windowManager.currentWindowMetrics.bounds
        } else {
            val display = windowManager.defaultDisplay
            android.graphics.Rect(0, 0, display.width, display.height)
        }
        
        val screenWidth = metrics.width()
        val screenHeight = metrics.height()
        val zoneSize = 180

        dismissZoneCentreX = screenWidth / 2
        dismissZoneCentreY = screenHeight - 150 - (zoneSize / 2)

        val zoneParams = WindowManager.LayoutParams(
            zoneSize, zoneSize,
            layoutFlag,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            PixelFormat.TRANSLUCENT
        )
        zoneParams.gravity = Gravity.TOP or Gravity.START
        zoneParams.x = dismissZoneCentreX - (zoneSize / 2)
        zoneParams.y = dismissZoneCentreY - (zoneSize / 2)

        val container = FrameLayout(this)
        val bg = GradientDrawable()
        bg.shape = GradientDrawable.OVAL
        bg.setColor(Color.argb(200, 40, 40, 40))
        container.background = bg

        val xLabel = TextView(this)
        xLabel.text = "✕"
        xLabel.textSize = 32f
        xLabel.setTextColor(Color.WHITE)
        val lp = FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT)
        lp.gravity = Gravity.CENTER
        xLabel.layoutParams = lp

        container.addView(xLabel)

        dismissView = container
        windowManager.addView(container, zoneParams)
    }

    private fun hideDismissZone() {
        dismissView?.let {
            try { windowManager.removeView(it) } catch (_: Exception) {}
        }
        dismissView = null
    }

    private fun highlightDismissZone(active: Boolean) {
        val container = dismissView as? FrameLayout ?: return
        val bg = container.background as? GradientDrawable ?: return
        if (active) {
            bg.setColor(Color.argb(220, 220, 40, 40))
            container.scaleX = 1.2f
            container.scaleY = 1.2f
        } else {
            bg.setColor(Color.argb(200, 40, 40, 40))
            container.scaleX = 1.0f
            container.scaleY = 1.0f
        }
    }

    private fun startForegroundService() {
        val channelId = "remie_service_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Remie Widget",
                NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            Notification.Builder(this, channelId)
        else
            Notification.Builder(this)

        startForeground(1, builder
            .setContentTitle("Remie Chat")
            .setContentText("Tap to open app")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .build()
        )
    }

    override fun onDestroy() {
        super.onDestroy()
        hideDismissZone()
        if (::floatingView.isInitialized) {
            try { windowManager.removeView(floatingView) } catch (_: Exception) {}
        }
    }
}
