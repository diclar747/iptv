package com.cinetv.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import com.cinetv.app.data.AppVersion
import com.cinetv.app.data.Net
import com.cinetv.app.ui.AppViewModel
import com.cinetv.app.ui.CineTheme
import com.cinetv.app.ui.LoginScreen
import com.cinetv.app.ui.MainScreen
import com.cinetv.app.ui.PlayerScreen
import com.cinetv.app.ui.SplashLoading

// AppCompatActivity (= FragmentActivity): necesario para que el diálogo del
// botón de Chromecast (MediaRouteButton) pueda abrirse sin crashear.
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Permiso de notificaciones (Android 13+): para la notificación de
        // reproducción. Si se niega, la app sigue igual, solo sin notificación.
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            runCatching { requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001) }
        }
        setContent {
            CineTheme {
                val vm: AppViewModel = viewModel()
                val context = LocalContext.current
                LaunchedEffect(Unit) { vm.boot() }

                // Auto-update: compara la versión instalada con la disponible en el servidor.
                var update by remember { mutableStateOf<AppVersion?>(null) }
                LaunchedEffect(vm.user?.id) {
                    if (vm.user != null) {
                        try {
                            val remote = Net.api.appVersion()
                            val local = runCatching {
                                val p = context.packageManager.getPackageInfo(context.packageName, 0)
                                if (Build.VERSION.SDK_INT >= 28) p.longVersionCode.toInt()
                                else @Suppress("DEPRECATION") p.versionCode
                            }.getOrDefault(0)
                            if (remote.versionCode > local) update = remote
                        } catch (_: Exception) { /* sin conexión */ }
                    }
                }

                Box(Modifier.fillMaxSize()) {
                    when {
                        vm.booting -> SplashLoading()
                        vm.user == null -> LoginScreen(vm)
                        else -> MainScreen(vm)
                    }
                    val target = vm.play
                    if (target != null) PlayerScreen(target) { vm.closePlayer() }

                    update?.let { u ->
                        AlertDialog(
                            onDismissRequest = { update = null },
                            title = { Text("Nueva versión disponible") },
                            text = { Text("Hay una versión nueva de LiveTV (${u.versionName}). ¿Querés actualizar?") },
                            confirmButton = {
                                TextButton(onClick = {
                                    val url = u.url ?: "https://live.cd.com.py/cinetv.apk"
                                    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                                    update = null
                                }) { Text("Actualizar") }
                            },
                            dismissButton = { TextButton(onClick = { update = null }) { Text("Después") } }
                        )
                    }
                }
            }
        }
    }
}
