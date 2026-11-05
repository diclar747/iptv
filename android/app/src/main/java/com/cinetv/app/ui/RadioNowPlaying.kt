package com.cinetv.app.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cinetv.app.R
import kotlin.math.abs
import kotlin.math.sin

private val StudioMint = Color(0xFF54F1BF)

@Composable
fun RadioNowPlaying(target: PlayTarget, playing: Boolean, connecting: Boolean, failed: Boolean, volume: Float, onVolume: (Float) -> Unit, onToggle: () -> Unit) {
    Box(Modifier.fillMaxSize().background(Color(0xFF070E19))) {
        Image(painterResource(R.drawable.radio_studio), null, Modifier.fillMaxWidth().fillMaxHeight(.76f), contentScale = ContentScale.Crop, alignment = Alignment.TopCenter)
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0x44040A13), Color(0x33040A13), Color(0xF2070E19), Color(0xFF070E19)))))
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().padding(horizontal = 26.dp).padding(top = 76.dp, bottom = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            val color = when { playing -> StudioMint; failed -> Color(0xFFFF8295); else -> Color(0xFFFFCE80) }
            Row(Modifier.clip(RoundedCornerShape(50)).background(Color(0xCC0B1722)).border(1.dp, color.copy(alpha = .35f), RoundedCornerShape(50)).padding(horizontal = 14.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(6.dp).clip(CircleShape).background(color))
                Text(when { playing -> "EN VIVO"; failed -> "SIN SEÑAL · REINTENTANDO"; connecting -> "CONECTANDO"; else -> "EN PAUSA" }, color = color, fontWeight = FontWeight.Bold, fontSize = 10.sp, letterSpacing = 1.8.sp)
            }
            Spacer(Modifier.height(175.dp))
            Text("ESTÁS ESCUCHANDO", color = StudioMint, fontSize = 10.sp, letterSpacing = 3.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(12.dp))
            Text(target.title, color = Color.White, fontSize = 29.sp, lineHeight = 34.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, letterSpacing = (-.7).sp)
            Text(target.subtitle.ifBlank { "Radio en directo · Paraguay" }, color = Color(0xFF9CADC3), fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
            RadioWave(playing, Modifier.fillMaxWidth().height(62.dp).padding(horizontal = 20.dp, vertical = 10.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                Icon(Icons.Default.GraphicEq, null, tint = Color(0xFF496A72), modifier = Modifier.size(28.dp))
                FilledIconButton(onClick = onToggle, modifier = Modifier.size(74.dp).shadow(22.dp, CircleShape, ambientColor = StudioMint, spotColor = StudioMint), colors = IconButtonDefaults.filledIconButtonColors(containerColor = StudioMint, contentColor = Color(0xFF06251C))) {
                    if(connecting && !playing && !failed) CircularProgressIndicator(Modifier.size(28.dp), color = Color(0xFF06251C), strokeWidth = 2.dp)
                    else Icon(if(playing) Icons.Default.Pause else Icons.Default.PlayArrow, if(playing) "Pausar radio" else "Reproducir radio", modifier = Modifier.size(34.dp))
                }
                Icon(Icons.Default.Headphones, null, tint = Color(0xFF496A72), modifier = Modifier.size(28.dp))
            }
            Row(Modifier.fillMaxWidth().padding(top = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(Icons.Default.VolumeDown, null, tint = Color(0xFF7D91AB), modifier = Modifier.size(18.dp))
                Slider(volume, onVolume, modifier = Modifier.weight(1f), colors = SliderDefaults.colors(thumbColor = StudioMint, activeTrackColor = StudioMint, inactiveTrackColor = Color(0xFF25394B)))
                Icon(Icons.Default.VolumeUp, null, tint = Color(0xFF7D91AB), modifier = Modifier.size(18.dp))
            }
            Spacer(Modifier.height(14.dp))
            VoteButtons(target.reactionType, target.reactionId)
            Text("LA RADIO NOS CONECTA", color = Color(0xFF53677E), fontSize = 8.sp, letterSpacing = 2.sp, modifier = Modifier.padding(top = 22.dp))
        }
    }
}

@Composable
private fun RadioWave(playing: Boolean, modifier: Modifier) {
    val transition = rememberInfiniteTransition(label = "radio-wave")
    val phase by transition.animateFloat(0f, 6.283f, infiniteRepeatable(tween(1400, easing = LinearEasing)), label = "phase")
    Canvas(modifier) {
        val bars = 35
        val step = size.width / bars
        for(i in 0 until bars) {
            val envelope = .25f + .75f * sin((i + 1).toFloat() / (bars + 1) * 3.14159f)
            val height = if(playing) (0.15f + abs(sin(phase + i * .72f)) * .85f) * envelope * size.height else size.height * .08f
            drawLine(if(playing) StudioMint.copy(alpha = .45f + envelope * .5f) else Color(0xFF395565), Offset(step * (i + .5f), (size.height - height) / 2), Offset(step * (i + .5f), (size.height + height) / 2), strokeWidth = step * .38f, cap = StrokeCap.Round)
        }
    }
}
