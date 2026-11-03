package com.cinetv.app.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.ActivityInfo
import android.view.View
import android.view.ViewGroup
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.cast.CastPlayer
import androidx.media3.cast.SessionAvailabilityListener
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import androidx.mediarouter.app.MediaRouteButton
import com.cinetv.app.data.Net
import com.google.android.gms.cast.framework.CastButtonFactory
import com.google.android.gms.cast.framework.CastContext

@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(target: PlayTarget, onClose: () -> Unit) {
    val context = LocalContext.current
    val activity = context.findActivity()
    val castContext = remember { runCatching { CastContext.getSharedInstance(context) }.getOrNull() }

    val mediaItem = remember(target) {
        MediaItem.Builder()
            .setUri(target.url)
            .setMimeType(target.mime)
            .setMediaMetadata(MediaMetadata.Builder().setTitle(target.title).build())
            .build()
    }

    val exoPlayer = remember {
        val ds = OkHttpDataSource.Factory(Net.okHttp)
        ExoPlayer.Builder(context)
            .setMediaSourceFactory(DefaultMediaSourceFactory(ds))
            .build()
    }
    val castPlayer = remember(castContext) { castContext?.let { CastPlayer(it) } }
    var currentPlayer by remember { mutableStateOf<Player>(exoPlayer) }

    // Carga inicial: reproduce en el teléfono, o en la TV si ya hay sesión de cast.
    LaunchedEffect(target) {
        exoPlayer.setMediaItem(mediaItem)
        exoPlayer.prepare()
        if (castPlayer?.isCastSessionAvailable == true) {
            castPlayer.setMediaItem(mediaItem)
            castPlayer.playWhenReady = true
            exoPlayer.playWhenReady = false
            currentPlayer = castPlayer
        } else {
            exoPlayer.playWhenReady = true
        }
    }

    // Conecta/desconecta la TV: mueve la reproducción entre teléfono y Chromecast.
    DisposableEffect(castPlayer) {
        val listener = object : SessionAvailabilityListener {
            override fun onCastSessionAvailable() {
                castPlayer?.setMediaItem(mediaItem, exoPlayer.currentPosition)
                castPlayer?.playWhenReady = true
                exoPlayer.playWhenReady = false
                currentPlayer = castPlayer ?: exoPlayer
            }
            override fun onCastSessionUnavailable() {
                castPlayer?.let { exoPlayer.seekTo(it.currentPosition) }
                exoPlayer.playWhenReady = true
                currentPlayer = exoPlayer
            }
        }
        castPlayer?.setSessionAvailabilityListener(listener)
        onDispose { castPlayer?.setSessionAvailabilityListener(null) }
    }

    DisposableEffect(Unit) {
        activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        activity?.window?.decorView?.let { hideSystemBars(it) }
        onDispose {
            exoPlayer.release()
            castPlayer?.release()
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            activity?.window?.decorView?.let { showSystemBars(it) }
        }
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                PlayerView(ctx).apply {
                    useController = true
                    setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS)
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
                    )
                }
            },
            update = { it.player = currentPlayer }
        )

        Row(Modifier.align(Alignment.TopEnd).padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            if (castContext != null) {
                AndroidView(
                    modifier = Modifier.size(40.dp),
                    factory = { ctx ->
                        MediaRouteButton(ctx).apply {
                            CastButtonFactory.setUpMediaRouteButton(ctx.applicationContext, this)
                            setAlwaysVisible(true) // ícono visible aunque no haya dispositivos aún
                        }
                    }
                )
            }
            IconButton(onClick = onClose) {
                Icon(Icons.Filled.Close, contentDescription = "Cerrar", tint = Color.White)
            }
        }
    }
}

private fun Context.findActivity(): Activity? {
    var c = this
    while (c is ContextWrapper) {
        if (c is Activity) return c
        c = c.baseContext
    }
    return null
}

@Suppress("DEPRECATION")
private fun hideSystemBars(decor: View) {
    decor.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
}

@Suppress("DEPRECATION")
private fun showSystemBars(decor: View) {
    decor.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
}
