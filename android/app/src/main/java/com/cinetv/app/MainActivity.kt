package com.cinetv.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.cinetv.app.ui.AppViewModel
import com.cinetv.app.ui.CineTheme
import com.cinetv.app.ui.LoginScreen
import com.cinetv.app.ui.MainScreen
import com.cinetv.app.ui.PlayerScreen
import com.cinetv.app.ui.SplashLoading

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            CineTheme {
                val vm: AppViewModel = viewModel()
                LaunchedEffect(Unit) { vm.boot() }
                Box(Modifier.fillMaxSize()) {
                    when {
                        vm.booting -> SplashLoading()
                        vm.user == null -> LoginScreen(vm)
                        else -> MainScreen(vm)
                    }
                    val target = vm.play
                    if (target != null) PlayerScreen(target) { vm.closePlayer() }
                }
            }
        }
    }
}
