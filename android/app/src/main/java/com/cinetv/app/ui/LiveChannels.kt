package com.cinetv.app.ui

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import com.cinetv.app.R
import com.cinetv.app.data.Card as Channel
import com.cinetv.app.data.Net
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged

val StudioAccent = Color(0xFF54E3BA)
val StudioSurface = Color(0xFF0D1624)
private val StudioLine = Color(0xFF203044)

@Composable
fun ChannelSignalBadge(status: String) {
    val color=when(status){"online"->StudioAccent;"offline"->Color(0xFFFF8B9D);else->Color(0xFF94A8C2)}
    Text("● "+when(status){"online"->"ONLINE";"offline"->"OFFLINE";else->"SIN VERIFICAR"},color=color,fontSize=8.sp,fontWeight=FontWeight.Bold,letterSpacing=.5.sp,modifier=Modifier.clip(RoundedCornerShape(20.dp)).background(color.copy(alpha=.1f)).padding(horizontal=7.dp,vertical=4.dp))
}

@Composable
fun StudioChannelLogo(channel: Channel, modifier: Modifier) {
    Box(modifier.clip(RoundedCornerShape(16.dp)).background(Color(0xFF192A3D)).padding(10.dp), contentAlignment = Alignment.Center) {
        SubcomposeAsyncImage(Net.artworkUrl(channel.logo ?: channel.image), channel.displayTitle, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Fit,
            loading = { Icon(Icons.Default.LiveTv, null, tint = StudioAccent, modifier = Modifier.padding(8.dp)) },
            error = { Box(Modifier.fillMaxSize(),contentAlignment=Alignment.Center) { Text(channel.displayTitle.take(2).uppercase(),color=StudioAccent,fontSize=22.sp,fontWeight=FontWeight.Bold) } })
    }
}

@Composable
fun StudioChannelCard(channel: Channel, modifier: Modifier = Modifier, list: Boolean = false, onDetails: (() -> Unit)? = null, onPlay: () -> Unit) {
    val shape = RoundedCornerShape(22.dp)
    val surface = modifier.clip(shape).background(Brush.linearGradient(listOf(Color(0xFF132133), Color(0xFF0C1421))))
        .border(1.dp, StudioLine, shape).clickable(onClick = onPlay)
    if(list) {
        Row(surface.padding(13.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(13.dp)) {
            StudioChannelLogo(channel, Modifier.size(64.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(channel.displayTitle, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(listOfNotNull(channel.country, channel.category).joinToString(" · ").ifBlank { "Televisión en directo" }, color = Muted, fontSize = 11.sp, maxLines = 1)
                ChannelSignalBadge(channel.status)
            }
            if(onDetails != null) IconButton(onClick = onDetails, modifier = Modifier.size(32.dp)) { Icon(Icons.Default.Info, "Información del canal", tint = Muted, modifier = Modifier.size(19.dp)) }
            Icon(Icons.Default.PlayCircle, "Reproducir", tint = StudioAccent, modifier = Modifier.size(30.dp))
        }
    } else {
        Column(surface.padding(12.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.LiveTv, null, tint = StudioAccent, modifier = Modifier.size(12.dp))
                ChannelSignalBadge(channel.status)
                Spacer(Modifier.weight(1f))
                if(onDetails != null) IconButton(onClick = onDetails, modifier = Modifier.size(23.dp)) { Icon(Icons.Default.Info, "Información", tint = Muted, modifier = Modifier.size(16.dp)) }
            }
            StudioChannelLogo(channel, Modifier.fillMaxWidth().height(82.dp).padding(vertical = 7.dp))
            Text(channel.displayTitle, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 5.dp))
            Row(Modifier.fillMaxWidth().padding(top = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(channel.country ?: "TV", color = Muted, fontSize = 10.sp, modifier = Modifier.weight(1f))
                Icon(Icons.Default.PlayArrow, null, tint = StudioAccent, modifier = Modifier.size(19.dp))
            }
        }
    }
}

@Composable
fun StudioChannelShowcase(channels: List<Channel>, onPlay: (Channel) -> Unit, onOpen: (Channel) -> Unit) {
    if(channels.isEmpty()) return
    var index by remember(channels) { mutableIntStateOf(0) }
    LaunchedEffect(channels) { while(channels.size > 1) { delay(7000); index = (index + 1) % channels.size } }
    val channel = channels[index.coerceIn(0, channels.lastIndex)]
    Box(Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth().height(300.dp).clip(RoundedCornerShape(28.dp)).border(1.dp, StudioLine, RoundedCornerShape(28.dp))) {
        Image(painterResource(R.drawable.live_studio), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0x33060E19), Color(0xB307101B), Color(0xFF091320)))))
        Column(Modifier.fillMaxSize().padding(22.dp), verticalArrangement = Arrangement.SpaceBetween) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.LiveTv, null, tint = StudioAccent, modifier = Modifier.size(16.dp))
                Text("  TU VENTANA AL MUNDO", color = StudioAccent, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.4.sp)
            }
            Crossfade(channel, label = "studio-channel", animationSpec = tween(550)) { item ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    StudioChannelLogo(item, Modifier.size(76.dp))
                    Column(Modifier.weight(1f)) {
                        Text(item.displayTitle, color = Color.White, fontSize = 25.sp, lineHeight = 29.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text("Noticias, deporte y entretenimiento", color = Color(0xFFB4C5D8), fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp))
                    }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Button(onClick = { onPlay(channel) }, colors = ButtonDefaults.buttonColors(containerColor = StudioAccent, contentColor = Color(0xFF072219)), shape = RoundedCornerShape(14.dp)) {
                    Icon(Icons.Default.PlayArrow, null); Text("Ver canal", fontWeight = FontWeight.Bold)
                }
                IconButton(onClick = { onOpen(channel) }) { Icon(Icons.Default.Info, "Información del canal", tint = Color.White) }
                Spacer(Modifier.weight(1f))
                Text("${index + 1} / ${channels.size}", color = Color(0xFF9AB0C9), fontSize = 10.sp)
            }
        }
    }
}

@Composable
fun StudioShortcuts(onNavigate: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        listOf(Triple(2,"En vivo",Icons.Default.LiveTv), Triple(3,"Radios",Icons.Default.Radio), Triple(1,"Películas",Icons.Default.Movie)).forEach { (tab,label,icon) ->
            Column(Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).background(StudioSurface).border(1.dp, StudioLine, RoundedCornerShape(18.dp)).clickable { onNavigate(tab) }.padding(vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(7.dp)) {
                Icon(icon, label, tint = StudioAccent, modifier = Modifier.size(22.dp))
                Text(label, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}

@Composable
fun StudioLiveTab(vm: AppViewModel) {
    var country by remember(vm.geoCountry) { mutableStateOf(vm.geoCountry) }
    var category by remember { mutableStateOf<String?>(null) }
    var search by remember { mutableStateOf("") }
    var signalFilter by remember { mutableStateOf<String?>(null) }
    var dropdown by remember { mutableStateOf(false) }
    var list by remember { mutableStateOf(false) }
    var channels by remember { mutableStateOf<List<Channel>>(emptyList()) }
    var page by remember { mutableIntStateOf(1) }
    var total by remember { mutableIntStateOf(0) }
    var loading by remember { mutableStateOf(true) }
    var loadingMore by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var retry by remember { mutableIntStateOf(0) }
    var generation by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val countries = vm.meta?.countries.orEmpty()
    val selected = countries.firstOrNull { it.code == country }
    val gridState=rememberLazyGridState()
    val foreground=rememberForeground()
    LaunchedEffect(gridState,foreground) {
        if(!foreground)return@LaunchedEffect
        snapshotFlow { val known=channels.map{it.id}.toSet();gridState.layoutInfo.visibleItemsInfo.mapNotNull{it.key as? String}.filter{it in known}.take(20) }
          .distinctUntilChanged().collectLatest { ids ->
            if(ids.isNotEmpty())while(true){
                try {val states=Net.api.channelStatuses(ids.joinToString(",")).associateBy{it.id}
                    channels=channels.filter{states[it.id]?.status !in listOf("blocked","deleted")}.map{c->states[c.id]?.let{c.copy(status=it.status,checkedAt=it.checkedAt)}?:c}
                }catch(e:CancellationException){throw e}catch(_:Exception){}
                delay(10000)
            }
          }
    }
    suspend fun fetchPage(number: Int) = Net.api.channels(country = if(category == null) country else null, category = category, search = search, prefer = if(category != null) country else null, page = number, status = signalFilter)
    LaunchedEffect(country,category,search,retry,signalFilter) {
        generation++; loading = true; loadingMore = false; channels=emptyList(); error = null
        delay(300)
        try { val result = fetchPage(1); channels = result.items.orEmpty(); total = result.total; page = 1 }
        catch(e: CancellationException) { throw e }
        catch(_: Exception) { error = "No pudimos cargar los canales. Intentá nuevamente."; channels = emptyList() }
        finally { loading = false }
    }
    fun more() {
        if(loading||loadingMore||channels.size>=total)return
        val current = generation
        loadingMore = true
        scope.launch {
            try {
                val result = fetchPage(page + 1)
                if(current == generation) { channels = (channels + result.items.orEmpty()).distinctBy { it.id }; page++; total = result.total }
            } catch(e: CancellationException) { throw e }
            catch(_: Exception) { error = "No se pudo cargar la siguiente página" }
            finally { if(current==generation)loadingMore = false }
        }
    }
    LazyVerticalGrid(state=gridState,columns = if(list) GridCells.Fixed(1) else GridCells.Adaptive(156.dp), modifier = Modifier.fillMaxSize().background(Bg), contentPadding = PaddingValues(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("EL MUNDO EN TU PANTALLA", color = StudioAccent, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.8.sp)
                        Text("Televisión en vivo", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold, letterSpacing = (-.8).sp)
                    }
                    IconButton(onClick = { list = !list }) { Icon(if(list) Icons.Default.GridView else Icons.Default.ViewList, if(list) "Vista en cuadrícula" else "Vista en lista", tint = StudioAccent) }
                }
                Box(Modifier.fillMaxWidth().height(145.dp).clip(RoundedCornerShape(24.dp)).border(1.dp, StudioLine, RoundedCornerShape(24.dp))) {
                    Image(painterResource(R.drawable.live_studio), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(listOf(Color(0xF0081220), Color(0x55081220)))))
                    Column(Modifier.padding(20.dp).align(Alignment.CenterStart), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Icon(Icons.Default.LiveTv, null, tint = StudioAccent, modifier = Modifier.size(25.dp))
                        Text("Siempre hay algo para vos.", color = Color.White, fontSize = 21.sp, fontWeight = FontWeight.Bold)
                        Text("Elegí un canal y disfrutá el momento", color = Color(0xFFAAC0D9), fontSize = 11.sp)
                    }
                }
                OutlinedTextField(search, { search = it }, placeholder = { Text("Buscá un canal…", fontSize = 13.sp) }, leadingIcon = { Icon(Icons.Default.Search,null,tint = StudioAccent) },
                    trailingIcon = { if(search.isNotEmpty()) IconButton(onClick = { search = "" }) { Icon(Icons.Default.Close,"Limpiar búsqueda") } }, singleLine = true, shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth())
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f)) {
                        Row(Modifier.clip(RoundedCornerShape(14.dp)).background(StudioSurface).border(1.dp,StudioLine,RoundedCornerShape(14.dp)).clickable { dropdown = true }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Public,null,tint = StudioAccent,modifier = Modifier.size(17.dp))
                            Text("  ${selected?.flag.orEmpty()} ${selected?.name ?: country}", color = Color.White,fontSize = 12.sp)
                            Icon(Icons.Default.KeyboardArrowDown,null,tint = Muted, modifier = Modifier.size(18.dp))
                        }
                        DropdownMenu(dropdown,{ dropdown = false }) {
                            countries.forEach { c -> DropdownMenuItem(text = { Text("${c.flag.orEmpty()} ${c.name ?: c.code}") },onClick = { country = c.code; dropdown = false }) }
                        }
                    }
                    Text(if(loading) "Buscando…" else "$total canales", color = Muted,fontSize = 11.sp)
                }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(listOf(null to "Todos", "sports" to "Deportes", "news" to "Noticias", "entertainment" to "Entretenimiento", "kids" to "Infantil", "music" to "Música")) { (id,label) ->
                        FilterChip(category == id,{ category = id },label = { Text(label,fontSize = 12.sp) },colors = FilterChipDefaults.filterChipColors(selectedContainerColor = StudioAccent.copy(alpha = .17f),selectedLabelColor = StudioAccent))
                    }
                }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(listOf(null to "Todos los estados", "online" to "Online", "offline" to "Offline", "unchecked" to "Sin verificar")) { (id,label) ->
                        FilterChip(signalFilter == id,{signalFilter = id},label = {Text(label,fontSize = 11.sp)},colors = FilterChipDefaults.filterChipColors(selectedContainerColor = StudioAccent.copy(alpha = .15f),selectedLabelColor = StudioAccent))
                    }
                }
                if(category != null) Text("Canales de todos los países, priorizando ${selected?.name ?: country}",color = Muted,fontSize = 10.sp)
                if(loading) LinearProgressIndicator(Modifier.fillMaxWidth(),color = StudioAccent, trackColor = StudioSurface)
                error?.let { TextButton(onClick = { retry++ }) { Text(it,color = Color(0xFFFFC87F)) } }
            }
        }
        if(!loading) items(channels,key = { it.id }) { channel -> StudioChannelCard(channel,Modifier.fillMaxWidth(),list,onDetails = { vm.openCard(channel) }) { vm.playChannel(channel) } }
        if(!loading && channels.isEmpty() && error == null) item(span = { GridItemSpan(maxLineSpan) }) { Text("No encontramos canales con esos filtros.",color = Muted,modifier = Modifier.padding(24.dp)) }
        if(!loading && channels.size < total && channels.isNotEmpty()) item(key="more-$page",span = { GridItemSpan(maxLineSpan) }) {
            LaunchedEffect(page) { if(error==null)more() }
            OutlinedButton(onClick = { more() },enabled = !loadingMore,modifier = Modifier.fillMaxWidth(),shape = RoundedCornerShape(16.dp)) { Text(if(loadingMore) "Cargando…" else "Cargar más canales",color = StudioAccent) }
        }
    }
}
