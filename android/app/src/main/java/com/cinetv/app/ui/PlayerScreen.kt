package com.cinetv.app.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.ActivityInfo
import android.view.View
import android.view.ViewGroup
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.cast.CastPlayer
import androidx.media3.cast.SessionAvailabilityListener
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.mediarouter.app.MediaRouteButton
import com.cinetv.app.PlaybackHolder
import com.cinetv.app.PlaybackService
import com.cinetv.app.data.Net
import com.google.android.gms.cast.framework.CastButtonFactory
import com.google.android.gms.cast.framework.CastContext
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(target: PlayTarget, onClose: () -> Unit) {
    androidx.activity.compose.BackHandler{onClose()}
    val context = LocalContext.current
    val activity = context.findActivity()
    val castContext = remember { runCatching { CastContext.getSharedInstance(context) }.getOrNull() }

    val scope = rememberCoroutineScope()
    var controlsVisible by remember { mutableStateOf(true) }

    // Teléfono: URL del proxy (autenticada por cookie vía OkHttp).
    val mediaItem = remember(target) {
        MediaItem.Builder()
            .setUri(target.url)
            .setMimeType(target.mime)
            .setMediaMetadata(MediaMetadata.Builder().setTitle(target.title).build())
            .build()
    }

    // TV (cast): URL ABSOLUTA y FIRMADA (con token) que el receptor abre sin
    // cookie. Se pide al backend; hasta que llegue, se usa la del proxy.
    var castUri by remember(target) { mutableStateOf<String?>(null) }
    fun castMediaItem(): MediaItem =
        MediaItem.Builder()
            .setUri(castUri ?: target.url)
            .setMimeType(target.mime)
            .setMediaMetadata(MediaMetadata.Builder().setTitle(target.title).build())
            .build()

    val exoPlayer = remember { PlaybackService.obtainPlayer(context) }
    val foreground=rememberForeground()
    LaunchedEffect(foreground){if(!foreground&&!com.cinetv.app.AppSettings.background)exoPlayer.pause()}
    val castPlayer = remember(castContext) { castContext?.let { CastPlayer(it) } }
    var currentPlayer by remember { mutableStateOf<Player>(exoPlayer) }

    var playing by remember { mutableStateOf(false) }
    var buffering by remember { mutableStateOf(true) }
    var failed by remember { mutableStateOf(false) }
    var volume by remember { mutableStateOf(1f) }
    DisposableEffect(currentPlayer) {
        val observed = currentPlayer
        fun sync() { playing = observed.isPlaying; buffering = observed.playbackState == Player.STATE_BUFFERING || observed.playbackState == Player.STATE_IDLE }
        val observer = object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) { sync() }
            override fun onPlaybackStateChanged(state: Int) { sync(); if(state == Player.STATE_READY) failed = false }
            override fun onPlayerError(error: PlaybackException) { failed = true; sync() }
        }
        sync(); observed.addListener(observer)
        onDispose { observed.removeListener(observer) }
    }

    // Estado de reconexión para el overlay y el backoff de reintentos.
    var reconnecting by remember { mutableStateOf(false) }
    var attempt by remember { mutableIntStateOf(0) }
    var retryJob by remember { mutableStateOf<Job?>(null) }

    // Reintento automático: cuando el stream falla o termina (en vivo no debería
    // terminar), se re-prepara solo con backoff creciente y vuelve al borde en
    // directo. Para película, se reintenta pocas veces y no se repite al acabar.
    // Carga inicial: reproduce en el teléfono enseguida; en paralelo pide la URL
    // firmada de cast y, si ya hay sesión en la TV, proyecta con esa URL.
    LaunchedEffect(target) {
        PlaybackHolder.target=target
        if(exoPlayer.currentMediaItem?.localConfiguration?.uri.toString()!=target.url){exoPlayer.setMediaItem(mediaItem);exoPlayer.prepare();if (castPlayer?.isCastSessionAvailable != true) exoPlayer.playWhenReady = true}
        castUri = runCatching { Net.api.castUrl(target.rawUrl, target.ua, target.ref).url }.getOrNull()
        if (castPlayer?.isCastSessionAvailable == true) {
            castPlayer.setMediaItem(castMediaItem())
            castPlayer.playWhenReady = true
            exoPlayer.playWhenReady = false
            currentPlayer = castPlayer
        }
    }

    // Conecta/desconecta la TV: mueve la reproducción entre teléfono y Chromecast.
    DisposableEffect(castPlayer) {
        val l = object : SessionAvailabilityListener {
            override fun onCastSessionAvailable() {
                // Asegura la URL firmada antes de proyectar (si aún no llegó).
                if (castUri == null) {
                    scope.launch {
                        castUri = runCatching { Net.api.castUrl(target.rawUrl, target.ua, target.ref).url }.getOrNull()
                        castPlayer?.setMediaItem(castMediaItem())
                        castPlayer?.playWhenReady = true
                        exoPlayer.playWhenReady = false
                        currentPlayer = castPlayer ?: exoPlayer
                    }
                } else {
                    castPlayer?.setMediaItem(castMediaItem())
                    castPlayer?.playWhenReady = true
                    exoPlayer.playWhenReady = false
                    currentPlayer = castPlayer ?: exoPlayer
                }
            }
            override fun onCastSessionUnavailable() {
                castPlayer?.let { exoPlayer.seekTo(it.currentPosition) }
                exoPlayer.playWhenReady = true
                currentPlayer = exoPlayer
            }
        }
        castPlayer?.setSessionAvailabilityListener(l)
        onDispose { castPlayer?.setSessionAvailabilityListener(null) }
    }

    // Notificación de reproducción (play/pausa) mientras se mira un canal.
    DisposableEffect(Unit) {
        PlaybackHolder.player = exoPlayer
        PlaybackHolder.title = target.title
        runCatching {
            context.startService(Intent(context, PlaybackService::class.java))
        }
        onDispose {
            // El servicio conserva el reproductor al minimizar o recrear la pantalla.
        }
    }

    DisposableEffect(Unit) {
        activity?.requestedOrientation = if (target.isAudio) ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED else ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        activity?.window?.decorView?.let { hideSystemBars(it) }
        onDispose {
            // Solo la acción Cerrar detiene el servicio.
            castPlayer?.release()
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            activity?.window?.decorView?.let { showSystemBars(it) }
        }
    }

    Box(Modifier.fillMaxSize().background(Color.Black).windowInsetsPadding(WindowInsets.displayCutout)) {
        if (!target.isAudio) AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                PlayerView(ctx).apply {
                    useController = true
                    controllerShowTimeoutMs = 3000
                    controllerHideOnTouch = true
                    controllerAutoShow = false
                    // Keep the entire broadcast visible, including station logos and clocks.
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                    setControllerVisibilityListener(PlayerView.ControllerVisibilityListener { visibility -> controlsVisible = visibility == View.VISIBLE })
                    showController()
                    keepScreenOn = com.cinetv.app.AppSettings.keepScreenOn // no apagar la pantalla mirando TV
                    setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS)
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
                    )
                }
            },
            update = { it.player = currentPlayer }
        )

        if (!target.isAudio && controlsVisible) VideoStudioHeader(target, playing, buffering || reconnecting, failed)
        if (target.isAudio) {
            RadioNowPlaying(target, playing, buffering || reconnecting, failed, volume, { volume = it; currentPlayer.volume = it }, {
                if(currentPlayer.isPlaying) { retryJob?.cancel(); currentPlayer.pause() }
                else { if(currentPlayer.playbackState == Player.STATE_IDLE) currentPlayer.prepare(); currentPlayer.play() }
            })
        }
        if (!target.isAudio && target.reactionId.isNotBlank()) {
            SocialActions(target, Modifier.align(Alignment.CenterEnd).padding(end = 8.dp), overlay = true)
        }

        // Aviso de reconexión (solo cuando estamos reintentando tras un corte).
        if (reconnecting && !target.isAudio && !controlsVisible) {
            Row(
                Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 14.dp)
                    .background(Color(0xE6101217), RoundedCornerShape(20.dp))
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                Text("Reconectando…", color = Color.White, fontSize = 14.sp)
            }
        }

        if (target.isAudio || controlsVisible) Row(Modifier.align(Alignment.TopEnd).padding(8.dp).clip(RoundedCornerShape(24.dp)).background(Color(0xB30D1928)), verticalAlignment = Alignment.CenterVertically) {
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
            TvSettingsButton()
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
