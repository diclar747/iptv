package com.cinetv.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import com.cinetv.app.R
import kotlinx.coroutines.delay
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.cinetv.app.data.Net
import com.cinetv.app.data.RadioStation
import com.cinetv.app.data.ReactReq
import com.cinetv.app.data.ReactionsResp
import kotlinx.coroutines.launch

private val RadioMint = Color(0xFF4BE3B1)
private val RadioInk = Color(0xFF0C1220)

@Composable
fun RadioStatus(status: String) {
    val color = when(status) { "online" -> RadioMint; "offline" -> Color(0xFFFF778A); else -> Color(0xFFFFCC73) }
    Row(Modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = .12f)).padding(horizontal = 9.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        Box(Modifier.size(5.dp).clip(CircleShape).background(color))
        Text(when(status) { "online" -> "ONLINE"; "offline" -> "OFFLINE"; else -> "REVISANDO" }, color = color, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = .7.sp)
    }
}

@Composable
fun RadiosTab(vm: AppViewModel) {
    var stations by remember { mutableStateOf<List<RadioStation>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var search by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf("all") }
    var retry by remember { mutableStateOf(0) }
    LaunchedEffect(retry) {
        while (true) {
            try { stations = Net.api.radios().items; error = null }
            catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (_: Exception) { error = "No pudimos actualizar las señales. Tocá para reintentar." }
            loading = false
            delay(8000)
        }
    }
    val online = stations.count { it.status == "online" }
    val checking = stations.count { it.status == "checking" }
    val filtered = stations.filter {
        (filter == "all" || it.status == filter) &&
        (it.name + " " + it.city + " " + it.tags).contains(search, ignoreCase = true)
    }.sortedBy { when(it.status) { "online" -> 0; "checking" -> 1; else -> 2 } }
    LazyColumn(Modifier.fillMaxSize().background(Color(0xFF070B13)), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("TU FRECUENCIA", color = RadioMint, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
                    Text("Radios del Paraguay", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold, letterSpacing = (-.8).sp)
                }
                IconButton(onClick = { retry++ }) { Icon(Icons.Default.Refresh, "Actualizar señales", tint = RadioMint) }
            }
        }
        item {
            Box(Modifier.fillMaxWidth().height(145.dp).clip(RoundedCornerShape(24.dp)).border(1.dp, Color.White.copy(alpha = .08f), RoundedCornerShape(24.dp))) {
                Image(painterResource(R.drawable.radio_studio), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop, alignment = Alignment.Center)
                Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(listOf(Color(0xF00B1420), Color(0x660B1420)))))
                Column(Modifier.padding(20.dp).align(Alignment.CenterStart), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("DALE PLAY A TU DÍA", color = RadioMint, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp)
                    Text("Voces que conectan.", color = Color.White, fontSize = 23.sp, fontWeight = FontWeight.Bold)
                    Text(if(online > 0) "$online emisoras online ahora" else "Buscando señales en vivo…", color = Color(0xFFB5C4D7), fontSize = 12.sp)
                }
            }
        }
        item {
            OutlinedTextField(search, { search = it }, placeholder = { Text("Buscá tu radio o ciudad", fontSize = 13.sp) },
                leadingIcon = { Icon(Icons.Default.Search, null, tint = Color(0xFF91A3BB)) }, singleLine = true,
                shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("online" to "En línea", "all" to "Todas", "offline" to "Offline").forEach { (value, label) ->
                    FilterChip(selected = filter == value, onClick = { filter = value }, label = { Text(label, fontSize = 12.sp) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = RadioMint.copy(alpha = .16f), selectedLabelColor = RadioMint))
                }
            }
            if (checking > 0 || loading) {
                LinearProgressIndicator(Modifier.fillMaxWidth().height(2.dp), color = RadioMint, trackColor = RadioInk)
                Text("Comprobando señal de las emisoras…", color = Muted, fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp))
            }
            error?.let { TextButton(onClick = { retry++ }) { Text(it, color = Color(0xFFFFCC73), fontSize = 12.sp) } }
        }
        if(filtered.isEmpty() && !loading && checking == 0) item { Text("No encontramos emisoras con ese filtro.", color = Muted) }
        items(filtered, key = { it.id }) { station ->
            val offline = station.status == "offline"
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
                .background(Brush.horizontalGradient(listOf(RadioInk, Color(0xFF111B29))))
                .border(1.dp, if(station.status == "online") RadioMint.copy(alpha = .18f) else Color.White.copy(alpha = .05f), RoundedCornerShape(20.dp))
                .clickable(enabled = !offline) { vm.playRadio(station) }.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(52.dp).clip(RoundedCornerShape(15.dp)).background(Color(0xFF1B3040)), contentAlignment = Alignment.Center) {
                    SubcomposeAsyncImage(model = station.logo, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize().padding(5.dp),
                        loading = { Icon(Icons.Default.Radio, null, tint = RadioMint, modifier = Modifier.padding(10.dp)) },
                        error = { Icon(Icons.Default.Radio, null, tint = if(offline) Muted else RadioMint, modifier = Modifier.padding(10.dp)) })
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text(station.name, color = if(offline) Muted else Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(station.city.ifBlank { "Paraguay" }, color = Color(0xFF8D9FB6), fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    RadioStatus(station.status)
                }
                Box(Modifier.size(36.dp).clip(CircleShape).background(if(offline) Color(0xFF263041) else RadioMint.copy(alpha = .13f)), contentAlignment = Alignment.Center) {
                    Icon(if(offline) Icons.Default.CloudOff else Icons.Default.PlayArrow, if(offline) "Sin señal" else "Escuchar", tint = if(offline) Muted else RadioMint, modifier = Modifier.size(22.dp))
                }
            }
        }
        item { Text("Señales verificadas periódicamente · LiveTV", color = Muted, fontSize = 10.sp, modifier = Modifier.padding(vertical = 12.dp)) }
    }
}

@Composable
fun VoteButtons(type: String, id: String) {
    var state by remember(type, id) { mutableStateOf(ReactionsResp()) }
    var busy by remember(type, id) { mutableStateOf(false) }
    var error by remember(type, id) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(type, id) {
        while (true) {
            try { state = Net.api.reactions(type, id); error = null }
            catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (_: Exception) { error = "No se pudieron cargar los votos" }
            delay(5000)
        }
    }
    fun vote(value: Int) {
        busy = true; error = null
        scope.launch {
            try {
                val result = Net.api.toggleLike(ReactReq(type, id, value))
                state = state.copy(likes = result.likes, liked = result.liked, dislikes = result.dislikes, disliked = result.disliked)
            } catch (_: Exception) { error = "No se guardó el voto. Volvé a intentar." }
            finally { busy = false }
        }
    }
    Column {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            VotePill(state.liked, state.likes, true, busy) { vote(1) }
            VotePill(state.disliked, state.dislikes, false, busy) { vote(-1) }
        }
        error?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
    }
}

@Composable
private fun VotePill(selected: Boolean, count: Int, positive: Boolean, busy: Boolean, onClick: () -> Unit) {
    val accent = if(positive) RadioMint else Color(0xFFFF8295)
    Row(Modifier.clip(RoundedCornerShape(50)).background(if(selected) accent.copy(alpha = .18f) else Color(0xFF182233))
        .border(1.dp, if(selected) accent.copy(alpha = .5f) else Color.White.copy(alpha = .08f), RoundedCornerShape(50))
        .clickable(enabled = !busy, onClick = onClick).padding(horizontal = 20.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(if(positive) Icons.Default.ThumbUp else Icons.Default.ThumbDown, if(positive) "Me gusta" else "No me gusta", tint = if(selected) accent else Color(0xFFCED9E8), modifier = Modifier.size(21.dp))
        Text(count.toString(), color = if(selected) accent else Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}
