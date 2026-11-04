package com.cinetv.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.IBinder
import androidx.annotation.OptIn
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerNotificationManager

// Puente entre el reproductor (que vive en la pantalla Compose) y el servicio de
// notificación: la pantalla deja aquí el Player activo y el servicio lo usa.
object PlaybackHolder {
    @Volatile var player: Player? = null
    @Volatile var title: String? = null
}

// Servicio en primer plano que muestra la notificación de reproducción
// (play/pausa) mientras se mira un canal. No crea su propio reproductor: usa el
// de PlaybackHolder. Si no hay reproductor, se detiene.
@OptIn(UnstableApi::class)
class PlaybackService : android.app.Service() {
    private var manager: PlayerNotificationManager? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val player = PlaybackHolder.player
        if (player == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (manager == null) {
            manager = PlayerNotificationManager.Builder(this, NOTIFICATION_ID, CHANNEL_ID)
                .setSmallIconResourceId(android.R.drawable.ic_media_play)
                .setMediaDescriptionAdapter(object : PlayerNotificationManager.MediaDescriptionAdapter {
                    override fun getCurrentContentTitle(player: Player): CharSequence =
                        PlaybackHolder.title ?: "CineTV"
                    override fun createCurrentContentIntent(player: Player): PendingIntent? {
                        val i = Intent(this@PlaybackService, MainActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                        return PendingIntent.getActivity(
                            this@PlaybackService, 0, i, PendingIntent.FLAG_IMMUTABLE
                        )
                    }
                    override fun getCurrentContentText(player: Player): CharSequence = "En vivo"
                    override fun getCurrentLargeIcon(
                        player: Player,
                        callback: PlayerNotificationManager.BitmapCallback
                    ): Bitmap? = null
                })
                .setNotificationListener(object : PlayerNotificationManager.NotificationListener {
                    override fun onNotificationPosted(id: Int, notification: android.app.Notification, ongoing: Boolean) {
                        if (ongoing) runCatching { startForeground(id, notification) }
                        else stopForeground(STOP_FOREGROUND_DETACH)
                    }
                    override fun onNotificationCancelled(id: Int, dismissedByUser: Boolean) {
                        stopSelf()
                    }
                })
                .build()
                .apply {
                    setUseNextAction(false)
                    setUsePreviousAction(false)
                    setUseFastForwardAction(false)
                    setUseRewindAction(false)
                }
        }
        manager?.setPlayer(player)
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        manager?.setPlayer(null)
        manager = null
        super.onDestroy()
    }

    private fun createChannel() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Reproducción", NotificationManager.IMPORTANCE_LOW)
                    .apply { setShowBadge(false) }
            )
        }
    }

    companion object {
        private const val CHANNEL_ID = "cinetv_playback"
        private const val NOTIFICATION_ID = 42
    }
}
