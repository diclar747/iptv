package com.cinetv.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Red = Color(0xFFED0025)
val Bg = Color(0xFF050609)
val Surface = Color(0xFF14151B)
val Muted = Color(0xFF9AA0AD)

private val CineColors = darkColorScheme(
    primary = Red,
    onPrimary = Color.White,
    background = Bg,
    onBackground = Color(0xFFEEF0F5),
    surface = Surface,
    onSurface = Color(0xFFEEF0F5),
    surfaceVariant = Color(0xFF1C1D25),
)

@Composable
fun CineTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = CineColors, content = content)
}
