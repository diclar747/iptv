package com.cinetv.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.cinetv.app.data.Card
import com.cinetv.app.data.Net

@Composable
fun SplashLoading() {
    Box(Modifier.fillMaxSize().background(Bg), contentAlignment = Alignment.Center) {
        Text("CineTV", color = Red, fontSize = 34.sp, fontWeight = FontWeight.Black)
    }
}

@Composable
fun LoginScreen(vm: AppViewModel) {
    var u by remember { mutableStateOf("") }
    var p by remember { mutableStateOf("") }
    Box(Modifier.fillMaxSize().background(Bg).padding(24.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.widthMax()) {
            Text("CineTV", color = Red, fontSize = 40.sp, fontWeight = FontWeight.Black)
            Text("Toda la TV del mundo, en vivo.", color = Muted, fontSize = 14.sp)
            Spacer(Modifier.height(24.dp))
            OutlinedTextField(value = u, onValueChange = { u = it }, label = { Text("Usuario") },
                singleLine = true, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(value = p, onValueChange = { p = it }, label = { Text("Contraseña") },
                singleLine = true, modifier = Modifier.fillMaxWidth())
            vm.error?.let { Text(it, color = Red, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp)) }
            Spacer(Modifier.height(16.dp))
            Button(onClick = { vm.login(u, p) }, enabled = !vm.busy && u.isNotBlank() && p.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = Red), modifier = Modifier.fillMaxWidth().height(50.dp)) {
                Text(if (vm.busy) "Entrando…" else "Entrar", fontWeight = FontWeight.Bold)
            }
            TextButton(onClick = { vm.loginDemo() }, enabled = !vm.busy) {
                Text("▶ Entrar como prueba", color = Color.White)
            }
        }
    }
}

private fun Modifier.widthMax() = this.fillMaxWidth().padding(horizontal = 8.dp)

@Composable
fun MainScreen(vm: AppViewModel) {
    var tab by remember { mutableStateOf(0) }
    val tabs = listOf(
        Triple("Inicio", Icons.Filled.Home, 0),
        Triple("Pelis", Icons.Filled.Movie, 1),
        Triple("Series", Icons.Filled.Tv, 2),
        Triple("En Vivo", Icons.Filled.LiveTv, 3),
    )
    Scaffold(
        containerColor = Bg,
        bottomBar = {
            NavigationBar(containerColor = Color(0xFF0A0B10)) {
                tabs.forEach { (label, icon, idx) ->
                    NavigationBarItem(
                        selected = tab == idx,
                        onClick = { tab = idx },
                        icon = { Icon(icon, contentDescription = label) },
                        label = { Text(label, fontSize = 11.sp) },
                    )
                }
            }
        }
    ) { pad ->
        Box(Modifier.fillMaxSize().padding(pad)) {
            when (tab) {
                0 -> HomeTab(vm)
                1 -> GridTab(vm) { Net.api.movies() }
                2 -> GridTab(vm) { Net.api.seriesList() }
                else -> GridTab(vm) { Net.api.channels().items ?: emptyList() }
            }
        }
    }
    vm.detail?.let { DetailOverlay(vm, it) }
}

@Composable
private fun HomeTab(vm: AppViewModel) {
    LazyColumn(contentPadding = PaddingValues(bottom = 16.dp)) {
        item { Banner(vm) }
        items(vm.rows) { row ->
            if (!row.items.isNullOrEmpty()) {
                Text(row.title ?: "", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = 14.dp, top = 16.dp, bottom = 8.dp))
                LazyRow(contentPadding = PaddingValues(horizontal = 14.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(row.items) { PosterCard(it) { vm.openCard(it) } }
                }
            }
        }
    }
}

@Composable
private fun Banner(vm: AppViewModel) {
    val card = vm.featured.firstOrNull() ?: return
    Box(Modifier.fillMaxWidth().height(230.dp)) {
        AsyncImage(model = card.backdrop ?: card.image, contentDescription = null,
            contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        Box(Modifier.fillMaxSize().background(
            Brush.verticalGradient(listOf(Color.Transparent, Bg))))
        Column(Modifier.align(Alignment.BottomStart).padding(16.dp)) {
            Text(card.displayTitle, color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.height(10.dp))
            Button(onClick = { vm.openCard(card) }, colors = ButtonDefaults.buttonColors(containerColor = Red)) {
                Icon(Icons.Filled.PlayArrow, contentDescription = null)
                Text(if (card.available == true) " Ver ahora" else " Más info", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun GridTab(vm: AppViewModel, loader: suspend () -> List<Card>) {
    var items by remember { mutableStateOf<List<Card>?>(null) }
    LaunchedEffect(loader) {
        items = try { loader() } catch (_: Exception) { emptyList() }
    }
    val list = items
    if (list == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Red) }
        return
    }
    LazyVerticalGrid(
        columns = GridCells.Adaptive(110.dp),
        contentPadding = PaddingValues(12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(list) { PosterCard(it) { vm.openCard(it) } }
    }
}

@Composable
private fun PosterCard(card: Card, onClick: () -> Unit) {
    Column(Modifier.width(118.dp).clickable { onClick() }) {
        Box(
            Modifier.fillMaxWidth().aspectRatio(2f / 3f)
                .clip(RoundedCornerShape(10.dp)).background(Surface)
        ) {
            if (card.image != null) {
                AsyncImage(model = card.image, contentDescription = card.displayTitle,
                    contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            } else {
                Text(card.displayTitle, color = Muted, fontSize = 12.sp, modifier = Modifier.padding(8.dp))
            }
        }
        Text(card.displayTitle, color = Color.White, fontSize = 12.sp, maxLines = 1,
            overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 5.dp))
    }
}

@Composable
private fun DetailOverlay(vm: AppViewModel, detail: Detail) {
    Box(Modifier.fillMaxSize().background(Bg)) {
        LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
            when (detail) {
                is Detail.Movie -> {
                    val d = detail.d
                    item {
                        DetailHeader(d.backdrop ?: d.poster, d.title ?: "", buildString {
                            d.year?.let { append(it) }
                            d.runtime?.let { if (isNotEmpty()) append("  ·  "); append("$it min") }
                            d.rating?.let { if (isNotEmpty()) append("  ·  "); append("★ $it") }
                        }, d.genres?.joinToString(" · ") ?: "")
                        Row(Modifier.padding(horizontal = 16.dp)) {
                            if (d.available == true) {
                                Button(onClick = { vm.playMovie(d) }, colors = ButtonDefaults.buttonColors(containerColor = Red)) {
                                    Icon(Icons.Filled.PlayArrow, null); Text(" Ver ahora", fontWeight = FontWeight.Bold)
                                }
                            } else {
                                Text("Próximamente — sin fuente disponible", color = Muted, fontSize = 13.sp)
                            }
                        }
                        d.overview?.let { Text(it, color = Color(0xFFC7CBD4), fontSize = 14.sp, modifier = Modifier.padding(16.dp)) }
                        Text("Metadatos por TheTVDB", color = Color(0xFF5C6879), fontSize = 11.sp, modifier = Modifier.padding(start = 16.dp))
                    }
                }
                is Detail.Serie -> {
                    val d = detail.d
                    item {
                        DetailHeader(d.backdrop ?: d.poster, d.title ?: "", "${d.episodes?.size ?: 0} episodios",
                            d.genres?.joinToString(" · ") ?: "")
                        d.overview?.let { Text(it, color = Color(0xFFC7CBD4), fontSize = 14.sp, modifier = Modifier.padding(16.dp)) }
                        Text("EPISODIOS", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(start = 16.dp, bottom = 6.dp))
                    }
                    items(d.episodes ?: emptyList()) { ep ->
                        Row(Modifier.fillMaxWidth()
                            .clickable(enabled = ep.available == true) {
                                ep.streamUrl?.let { vm.playEpisodeUrl(it, "${d.title} T${ep.season}·E${ep.episode}") }
                            }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically) {
                            Text("T${ep.season}·E${ep.episode}", color = Red, fontSize = 12.sp, modifier = Modifier.width(56.dp))
                            Text(ep.title ?: "Episodio ${ep.episode}", color = Color.White, fontSize = 14.sp,
                                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                            if (ep.available == true) Icon(Icons.Filled.PlayArrow, null, tint = Color.White)
                            else Text("próx.", color = Muted, fontSize = 11.sp)
                        }
                    }
                }
            }
        }
        IconButton(onClick = { vm.closeDetail() }, modifier = Modifier.align(Alignment.TopEnd).padding(8.dp)) {
            Icon(Icons.Filled.Close, contentDescription = "Cerrar", tint = Color.White)
        }
    }
}

@Composable
private fun DetailHeader(image: String?, title: String, meta: String, genres: String) {
    Box(Modifier.fillMaxWidth().height(220.dp)) {
        AsyncImage(model = image, contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize())
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Bg))))
    }
    Text(title, color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black,
        modifier = Modifier.padding(start = 16.dp, top = 6.dp))
    if (meta.isNotBlank()) Text(meta, color = Muted, fontSize = 13.sp, modifier = Modifier.padding(start = 16.dp, top = 4.dp))
    if (genres.isNotBlank()) Text(genres, color = Muted, fontSize = 12.sp, modifier = Modifier.padding(start = 16.dp, top = 2.dp, bottom = 10.dp))
}
