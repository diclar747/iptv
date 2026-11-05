package com.cinetv.app.ui

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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cinetv.app.R
import com.cinetv.app.data.Card as Channel

@Composable
fun StudioLoginScreen(vm: AppViewModel) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var visible by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().background(Bg)) {
        Image(painterResource(R.drawable.live_studio),null,Modifier.fillMaxWidth().fillMaxHeight(.6f),contentScale = ContentScale.Crop)
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0x55070B13),Bg.copy(alpha = .95f),Bg))))
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().imePadding().padding(26.dp),verticalArrangement = Arrangement.Center) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.PlayCircle,null,tint = Red,modifier = Modifier.size(34.dp))
                Text(" LiveTV",color = Color.White,fontSize = 32.sp,fontWeight = FontWeight.Bold,letterSpacing = (-1).sp)
            }
            Text("Tu mundo, en directo.",color = Color.White,fontSize = 28.sp,fontWeight = FontWeight.Bold,modifier = Modifier.padding(top = 36.dp))
            Text("Televisión, radio y cine. En un solo lugar.",color = Muted,fontSize = 13.sp,modifier = Modifier.padding(top = 8.dp,bottom = 26.dp))
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(26.dp)).background(StudioSurface.copy(alpha = .93f)).border(1.dp,Color(0xFF25354A),RoundedCornerShape(26.dp)).padding(22.dp),verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("Bienvenido",color = Color.White,fontSize = 20.sp,fontWeight = FontWeight.SemiBold)
                OutlinedTextField(username,{username = it},label = {Text("Usuario")},leadingIcon = {Icon(Icons.Default.Person,null)},singleLine = true,shape = RoundedCornerShape(14.dp),modifier = Modifier.fillMaxWidth())
                OutlinedTextField(password,{password = it},label = {Text("Contraseña")},leadingIcon = {Icon(Icons.Default.Lock,null)},singleLine = true,visualTransformation = if(visible) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon = { IconButton(onClick = {visible = !visible}) {Icon(if(visible) Icons.Default.VisibilityOff else Icons.Default.Visibility,if(visible) "Ocultar contraseña" else "Mostrar contraseña")} },shape = RoundedCornerShape(14.dp),modifier = Modifier.fillMaxWidth())
                vm.error?.let {Text(it,color = Color(0xFFFF8D9E),fontSize = 12.sp)}
                Button(onClick = {vm.login(username,password)},enabled = !vm.busy && username.isNotBlank() && password.isNotBlank(),modifier = Modifier.fillMaxWidth().height(50.dp),shape = RoundedCornerShape(14.dp),colors = ButtonDefaults.buttonColors(containerColor = StudioAccent,contentColor = Color(0xFF08251B))) {
                    if(vm.busy) CircularProgressIndicator(Modifier.size(20.dp),strokeWidth = 2.dp,color = Color(0xFF08251B)) else Text("Entrar a LiveTV",fontWeight = FontWeight.Bold)
                }
                TextButton(onClick = {vm.loginDemo()},enabled = !vm.busy,modifier = Modifier.align(Alignment.CenterHorizontally)) {Text("Explorar como prueba",color = Color(0xFFA9BCD3))}
            }
        }
    }
}

@Composable
fun StudioChannelHeader(channel: Channel) {
    Box(Modifier.fillMaxWidth().height(245.dp)) {
        Image(painterResource(R.drawable.live_studio),null,Modifier.fillMaxSize(),contentScale = ContentScale.Crop)
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0x66070B13),Bg))))
        Column(Modifier.align(Alignment.BottomStart).padding(22.dp),verticalArrangement = Arrangement.spacedBy(14.dp)) {
            StudioChannelLogo(channel,Modifier.size(82.dp))
            Text(channel.displayTitle,color = Color.White,fontSize = 27.sp,fontWeight = FontWeight.Bold,maxLines = 2,overflow = TextOverflow.Ellipsis)
            Text(listOfNotNull(channel.country,channel.category).joinToString(" · ").ifBlank {"Televisión en directo"},color = StudioAccent,fontSize = 11.sp)
        }
    }
}

@Composable
fun VideoStudioHeader(target: PlayTarget, playing: Boolean, connecting: Boolean, failed: Boolean) {
    val accent = when { failed -> Color(0xFFFF8295); playing -> StudioAccent; else -> Color(0xFFFFCC80) }
    Row(Modifier.fillMaxWidth().background(Brush.verticalGradient(listOf(Color(0xD907101B),Color.Transparent))).padding(start = 20.dp,end = 155.dp,top = 15.dp,bottom = 24.dp),verticalAlignment = Alignment.CenterVertically,horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(38.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xB3192A3D)).border(1.dp,accent.copy(alpha = .3f),RoundedCornerShape(12.dp)),contentAlignment = Alignment.Center) {
            Icon(if(target.isLive) Icons.Default.LiveTv else Icons.Default.Movie,null,tint = accent,modifier = Modifier.size(21.dp))
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(target.title,color = Color.White,fontSize = 14.sp,fontWeight = FontWeight.SemiBold,maxLines = 1,overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically,horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Box(Modifier.size(4.dp).clip(CircleShape).background(accent))
                Text(when {failed -> "REINTENTANDO SEÑAL"; connecting -> "CONECTANDO"; playing && target.isLive -> "EN VIVO"; playing -> "REPRODUCIENDO"; else -> "EN PAUSA"},color = accent,fontSize = 8.sp,fontWeight = FontWeight.Bold,letterSpacing = 1.2.sp)
            }
        }
    }
}
