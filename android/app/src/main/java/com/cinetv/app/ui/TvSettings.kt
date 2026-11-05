package com.cinetv.app.ui

import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.mediarouter.app.MediaRouteButton
import androidx.mediarouter.media.MediaRouter
import androidx.mediarouter.media.MediaRouteSelector
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.framework.CastButtonFactory
import com.google.android.gms.cast.framework.CastContext

@Composable
fun TvSettings(onClose: () -> Unit) {
    val context = LocalContext.current
    val supported = remember { runCatching { CastContext.getSharedInstance(context) }.isSuccess }
    var devices by remember { mutableStateOf(0) }
    var attempt by remember { mutableStateOf(0) }
    var message by remember { mutableStateOf<String?>(null) }
    DisposableEffect(attempt) {
        val router = MediaRouter.getInstance(context)
        val selector = MediaRouteSelector.Builder().addControlCategory(CastMediaControlIntent.categoryForCast("CC1AD845")).build()
        fun refresh() { devices = router.routes.count { !it.isDefault && it.isEnabled && it.matchesSelector(selector) } }
        val callback = object : MediaRouter.Callback() {
            override fun onRouteAdded(router: MediaRouter, route: MediaRouter.RouteInfo) { refresh() }
            override fun onRouteRemoved(router: MediaRouter, route: MediaRouter.RouteInfo) { refresh() }
            override fun onRouteChanged(router: MediaRouter, route: MediaRouter.RouteInfo) { refresh() }
        }
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        val lock = runCatching { wifi?.createMulticastLock("LiveTV-TV-discovery")?.apply { setReferenceCounted(false); acquire() } }.getOrNull()
        router.addCallback(selector, callback, MediaRouter.CALLBACK_FLAG_REQUEST_DISCOVERY)
        refresh()
        onDispose { router.removeCallback(callback); if (lock?.isHeld == true) lock.release() }
    }
    fun openSettings(action: String) {
        runCatching { context.startActivity(Intent(action)) }.onFailure { message = "Este teléfono no ofrece esa configuración. Usá los ajustes rápidos de Android." }
    }
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Conectar a Smart TV") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Conectá el teléfono y el televisor a la misma red Wi-Fi. Evitá redes de invitados y desactivá la VPN para probar.")
                Text(if (supported) "$devices dispositivos Google Cast detectados" else "Google Cast no está disponible en este teléfono.")
                if (supported) {
                    Text("Tocá el botón para buscar y elegir un Chromecast o televisor con Google Cast:")
                    AndroidView(modifier = Modifier.size(48.dp), factory = { ctx -> MediaRouteButton(ctx).apply {
                        CastButtonFactory.setUpMediaRouteButton(ctx, this)
                        setAlwaysVisible(true)
                        contentDescription = "Buscar televisores con Google Cast"
                    } })
                }
                TextButton(onClick = { attempt++ }) { Text("Volver a buscar") }
                TextButton(onClick = { openSettings(Settings.ACTION_WIFI_SETTINGS) }) { Text("Configurar Wi-Fi") }
                HorizontalDivider()
                Text("Duplicar pantalla")
                Text("Para Smart View o Miracast, usá la función de transmitir pantalla de Android. La compatibilidad depende del teléfono y del televisor.")
                TextButton(onClick = { openSettings(Settings.ACTION_CAST_SETTINGS) }) { Text("Abrir transmisión de Android") }
                message?.let { Text(it) }
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text("Cerrar") } },
    )
}

@Composable
fun TvSettingsButton() {
    var open by remember { mutableStateOf(false) }
    TextButton(onClick = { open = true }) { Text("TV", color = androidx.compose.ui.graphics.Color.White) }
    if (open) TvSettings { open = false }
}
