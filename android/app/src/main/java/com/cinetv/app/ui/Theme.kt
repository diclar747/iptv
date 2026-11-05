package com.cinetv.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Red = Color(0xFFED0025)
val Bg = Color(0xFF070B13)
val Surface = Color(0xFF0D1624)
val Muted = Color(0xFF9AA0AD)

private val CineColors = darkColorScheme(
    primary = Color(0xFF54E3BA),
    secondary = Color(0xFF72C8EE),
    onPrimary = Color(0xFF06241B),
    background = Bg,
    onBackground = Color(0xFFEEF0F5),
    surface = Surface,
    onSurface = Color(0xFFEEF0F5),
    surfaceVariant = Color(0xFF18263A),
)

@Composable
fun CineTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = CineColors, content = content)
}
