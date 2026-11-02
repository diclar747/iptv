package com.cinetv.app.ui

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Tv
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import com.cinetv.app.data.User

private val Panel = Color(0xFF0A0B10)

@Composable
fun SplashLoading() {
    Box(Modifier.fillMaxSize().background(Bg), contentAlignment = Alignment.Center) {
        Text("CineTV", color = Red, fontSize = 36.sp, fontWeight = FontWeight.Black)
    }
}

@Composable
fun LoginScreen(vm: AppViewModel) {
    var u by remember { mutableStateOf("") }
    var p by remember { mutableStateOf("") }
    Box(Modifier.fillMaxSize().background(Bg).padding(24.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Text("CineTV", color = Red, fontSize = 42.sp, fontWeight = FontWeight.Black)
            Text("Toda la TV del mundo, en vivo.", color = Muted, fontSize = 14.sp)
            Spacer(Modifier.height(24.dp))
            OutlinedTextField(u, { u = it }, label = { Text("Usuario") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(p, { p = it }, label = { Text("Contraseña") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            vm.error?.let { Text(it, color = Red, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp)) }
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = { vm.login(u, p) }, enabled = !vm.busy && u.isNotBlank() && p.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = Red),
                modifier = Modifier.fillMaxWidth().height(50.dp)
            ) { Text(if (vm.busy) "Entrando…" else "Entrar", fontWeight = FontWeight.Bold) }
            TextButton(onClick = { vm.loginDemo() }, enabled = !vm.busy) {
                Text("▶ Entrar como prueba", color = Color.White)
            }
        }
    }
}

@Composable
fun MainScreen(vm: AppViewModel) {
    var tab by remember { mutableStateOf(0) }
    var searchOpen by remember { mutableStateOf(false) }
    val tabs = listOf(
        "Inicio" to Icons.Filled.Home, "Pelis" to Icons.Filled.Movie,
        "Series" to Icons.Filled.Tv, "En Vivo" to Icons.Filled.LiveTv, "Perfil" to Icons.Filled.Person,
    )
    Scaffold(
        containerColor = Bg,
        bottomBar = {
            NavigationBar(containerColor = Panel) {
                tabs.forEachIndexed { i, (label, icon) ->
                    NavigationBarItem(
                        selected = tab == i, onClick = { tab = i },
                        icon = { Icon(icon, label) }, label = { Text(label, fontSize = 10.sp) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Red, selectedTextColor = Red, indicatorColor = Color(0xFF1A1016)
                        )
                    )
                }
            }
        }
    ) { pad ->
        Column(Modifier.fillMaxSize().padding(pad)) {
            if (tab != 4) TopBar(vm.user, onSearch = { searchOpen = true }, onProfile = { tab = 4 })
            when (tab) {
                0 -> HomeTab(vm)
                1 -> MoviesTab(vm)
                2 -> GridTab(vm) { Net.api.seriesList() }
                3 -> LiveTab(vm)
                else -> ProfileScreen(vm)
            }
        }
    }
    if (searchOpen) SearchOverlay(vm) { searchOpen = false }
    vm.detail?.let { DetailOverlay(vm, it) }
}

@Composable
private fun TopBar(user: User?, onSearch: () -> Unit, onProfile: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(Bg).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text("CineTV", color = Red, fontSize = 24.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.weight(1f))
        IconButton(onClick = onSearch) { Icon(Icons.Filled.Search, "Buscar", tint = Color.White) }
        Box(
            Modifier.size(36.dp).clip(CircleShape).background(Color(0xFF3A3F49)).clickable { onProfile() },
            contentAlignment = Alignment.Center
        ) {
            Text((user?.username?.firstOrNull() ?: 'U').uppercase(), color = Color.White, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun HomeTab(vm: AppViewModel) {
    LazyColumn(contentPadding = PaddingValues(bottom = 16.dp)) {
        item { Banner(vm) }
        items(vm.rows) { row ->
            if (!row.items.isNullOrEmpty()) {
                Text(row.title ?: "", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = 14.dp, top = 16.dp, bottom = 8.dp))
                LazyRow(contentPadding = PaddingValues(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(row.items) { PosterCard(it) { vm.openCard(it) } }
                }
            }
        }
    }
}

@Composable
private fun Banner(vm: AppViewModel) {
    val card = vm.featured.firstOrNull() ?: return
    Box(Modifier.fillMaxWidth().height(240.dp)) {
        AsyncImage(card.backdrop ?: card.image, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Bg))))
        Column(Modifier.align(Alignment.BottomStart).padding(16.dp)) {
            Text(card.displayTitle, color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.height(10.dp))
            Button(onClick = { vm.openCard(card) }, colors = ButtonDefaults.buttonColors(containerColor = Red)) {
                Icon(Icons.Filled.PlayArrow, null)
                Text(if (card.available == true) " Ver ahora" else " Más info", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun MoviesTab(vm: AppViewModel) {
    var cat by remember { mutableStateOf<String?>(null) }
    val cats = vm.meta?.categories.orEmpty()
    Column(Modifier.fillMaxSize()) {
        if (cats.isNotEmpty()) {
            LazyRow(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item { Chip("Todas", cat == null) { cat = null } }
                items(cats) { c -> Chip(c.name ?: c.id ?: "", cat == c.id) { cat = c.id } }
            }
        }
        GridTab(vm, key = cat) { Net.api.movies(category = cat) }
    }
}

@Composable
private fun Chip(label: String, selected: Boolean, onClick: () -> Unit) {
    FilterChip(
        selected = selected, onClick = onClick, label = { Text(label) },
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = Red, selectedLabelColor = Color.White,
            containerColor = Color(0xFF16171D), labelColor = Muted
        )
    )
}

@Composable
private fun LiveTab(vm: AppViewModel) {
    val countries = vm.meta?.countries.orEmpty()
    var country by remember { mutableStateOf("PY") }
    var cat by remember { mutableStateOf<String?>(null) } // null | "sports" | "news"
    var expanded by remember { mutableStateOf(false) }
    val current = countries.firstOrNull { it.code == country }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(start = 12.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box {
                Row(
                    Modifier.clip(RoundedCornerShape(10.dp)).background(Color(0xFF16171D)).clickable { expanded = true }
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text((current?.flag ?: "🌎") + "  " + (current?.name ?: "Paraguay"), color = Color.White, fontSize = 14.sp)
                    Icon(Icons.Filled.KeyboardArrowDown, null, tint = Muted)
                }
                DropdownMenu(expanded, onDismissRequest = { expanded = false }, modifier = Modifier.background(Color(0xFF16171D))) {
                    countries.forEach { c ->
                        DropdownMenuItem(
                            text = { Text("${c.flag ?: ""}  ${c.name ?: c.code}", color = Color.White) },
                            onClick = { country = c.code; expanded = false }
                        )
                    }
                }
            }
        }
        LazyRow(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item { Chip("Todos", cat == null) { cat = null } }
            item { Chip("Deportes", cat == "sports") { cat = "sports" } }
            item { Chip("Noticias", cat == "news") { cat = "news" } }
        }
        GridTab(vm, key = country + (cat ?: "")) {
            Net.api.channels(country = country, category = cat).items ?: emptyList()
        }
    }
}

@Composable
private fun GridTab(vm: AppViewModel, key: Any? = Unit, loader: suspend () -> List<Card>) {
    var items by remember(key) { mutableStateOf<List<Card>?>(null) }
    LaunchedEffect(key) { items = try { loader() } catch (_: Exception) { emptyList() } }
    val list = items
    if (list == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Red) }
        return
    }
    LazyVerticalGrid(
        columns = GridCells.Adaptive(110.dp), contentPadding = PaddingValues(12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(12.dp)
    ) { items(list) { PosterCard(it) { vm.openCard(it) } } }
}

@Composable
private fun PosterCard(card: Card, onClick: () -> Unit) {
    Column(Modifier.width(118.dp).clickable { onClick() }) {
        Box(Modifier.fillMaxWidth().aspectRatio(2f / 3f).clip(RoundedCornerShape(10.dp)).background(Surface)) {
            if (card.image != null) {
                AsyncImage(card.image, card.displayTitle, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            } else {
                Text(card.displayTitle, color = Muted, fontSize = 12.sp, modifier = Modifier.padding(8.dp))
            }
        }
        Text(card.displayTitle, color = Color.White, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 5.dp))
    }
}

@Composable
private fun SearchOverlay(vm: AppViewModel, onClose: () -> Unit) {
    var q by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<Card>>(emptyList()) }
    LaunchedEffect(q) {
        if (q.length < 2) { results = emptyList(); return@LaunchedEffect }
        kotlinx.coroutines.delay(300)
        results = try {
            val r = Net.api.search(q)
            (r.movies.orEmpty() + r.series.orEmpty())
        } catch (_: Exception) { emptyList() }
    }
    Box(Modifier.fillMaxSize().background(Bg)) {
        Column {
            Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(q, { q = it }, placeholder = { Text("Buscar películas, series…") }, singleLine = true, modifier = Modifier.weight(1f))
                IconButton(onClick = onClose) { Icon(Icons.Filled.Close, "Cerrar", tint = Color.White) }
            }
            LazyVerticalGrid(
                columns = GridCells.Adaptive(110.dp), contentPadding = PaddingValues(12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(12.dp)
            ) { items(results) { PosterCard(it) { vm.openCard(it) } } }
        }
    }
}

@Composable
private fun ProfileScreen(vm: AppViewModel) {
    val u = vm.user ?: return
    val ctx = LocalContext.current
    val staff = u.role == "admin" || u.role == "reseller"
    var favs by remember { mutableStateOf<List<Card>>(emptyList()) }
    LaunchedEffect(Unit) { favs = try { Net.api.favorites() } catch (_: Exception) { emptyList() } }

    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
            Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(84.dp).clip(CircleShape).background(Red), contentAlignment = Alignment.Center) {
                    Text(u.username.firstOrNull()?.uppercase() ?: "U", color = Color.White, fontSize = 38.sp, fontWeight = FontWeight.Black)
                }
                Spacer(Modifier.height(12.dp))
                Text(u.displayName ?: u.username, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Text(roleLabel(u.role), color = Red, fontSize = 13.sp)
            }
        }
        item {
            Column(Modifier.padding(horizontal = 16.dp)) {
                if (u.role == "reseller") {
                    InfoRow("Créditos", (u.credits ?: 0).toString())
                    u.phone?.let { InfoRow("Teléfono", it) }
                    u.address?.let { InfoRow("Dirección", it) }
                    InfoRow("Enlace de afiliado", "live.cd.com.py/?ref=${u.username}")
                }
                if (u.role == "client") {
                    InfoRow("Suscripción", if (u.subscription?.active == true) "Activa" else "Vencida")
                    u.packageName?.let { InfoRow("Paquete", it) }
                    u.expiresAt?.let { InfoRow("Vence", it.take(10)) }
                    InfoRow("Pantallas", (u.maxConnections ?: 1).toString())
                }
                if (u.role == "admin") InfoRow("Rol", "Administrador")
                Spacer(Modifier.height(18.dp))
                if (staff) {
                    Button(
                        onClick = { runCatching { ctx.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse("https://live.cd.com.py"))) } },
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Red)
                    ) { Text("Panel de gestión", fontWeight = FontWeight.Bold) }
                    Spacer(Modifier.height(10.dp))
                }
                Button(
                    onClick = { vm.logout() }, modifier = Modifier.fillMaxWidth().height(48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16171D))
                ) { Icon(Icons.Filled.Logout, null); Text("  Cerrar sesión", color = Color.White) }
            }
        }
        if (favs.isNotEmpty()) {
            item {
                Text("Mi Lista", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = 16.dp, top = 20.dp, bottom = 8.dp))
                LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(favs) { PosterCard(it) { vm.openCard(it) } }
                }
            }
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Muted, fontSize = 14.sp, modifier = Modifier.width(140.dp))
        Text(value, color = Color.White, fontSize = 14.sp, modifier = Modifier.weight(1f))
    }
    Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFF1C1D25)))
}

private fun roleLabel(r: String?) = when (r) {
    "admin" -> "Administrador"; "reseller" -> "Vendedor"; "client" -> "Cliente"; else -> r ?: ""
}

@Composable
private fun ActionRow(vm: AppViewModel, kind: String, id: Long, title: String) {
    val ctx = LocalContext.current
    var liked by remember(id) { mutableStateOf(false) }
    var inList by remember(id) { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(28.dp)) {
        ActionBtn(if (liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, "Me gusta", if (liked) Red else Color.White) { liked = !liked }
        ActionBtn(Icons.Filled.Add, if (inList) "✓ Mi Lista" else "Mi Lista", if (inList) Red else Color.White) {
            if (!inList) { vm.addFavorite(kind, id); inList = true }
        }
        ActionBtn(Icons.Filled.Share, "Compartir", Color.White) {
            val i = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(android.content.Intent.EXTRA_TEXT, "Mirá \"$title\" en CineTV 📺 https://live.cd.com.py")
            }
            ctx.startActivity(android.content.Intent.createChooser(i, "Compartir"))
        }
    }
}

@Composable
private fun ActionBtn(icon: ImageVector, label: String, tint: Color, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clickable { onClick() }) {
        Icon(icon, label, tint = tint, modifier = Modifier.size(26.dp))
        Spacer(Modifier.height(4.dp))
        Text(label, color = Muted, fontSize = 11.sp)
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
                            } else Text("Próximamente — sin fuente disponible", color = Muted, fontSize = 13.sp)
                        }
                        ActionRow(vm, "movie", d.id, d.title ?: "")
                        d.overview?.let { Text(it, color = Color(0xFFC7CBD4), fontSize = 14.sp, modifier = Modifier.padding(16.dp)) }
                        Text("Metadatos por TheTVDB / TMDB", color = Color(0xFF5C6879), fontSize = 11.sp, modifier = Modifier.padding(start = 16.dp))
                    }
                }
                is Detail.Serie -> {
                    val d = detail.d
                    item {
                        DetailHeader(d.backdrop ?: d.poster, d.title ?: "", "${d.episodes?.size ?: 0} episodios", d.genres?.joinToString(" · ") ?: "")
                        ActionRow(vm, "serie", d.id, d.title ?: "")
                        d.overview?.let { Text(it, color = Color(0xFFC7CBD4), fontSize = 14.sp, modifier = Modifier.padding(16.dp)) }
                        Text("EPISODIOS", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(start = 16.dp, bottom = 6.dp))
                    }
                    items(d.episodes ?: emptyList()) { ep ->
                        Row(
                            Modifier.fillMaxWidth().clickable(enabled = ep.available == true) {
                                ep.streamUrl?.let { vm.playEpisodeUrl(it, "${d.title} T${ep.season}·E${ep.episode}") }
                            }.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("T${ep.season}·E${ep.episode}", color = Red, fontSize = 12.sp, modifier = Modifier.width(56.dp))
                            Text(ep.title ?: "Episodio ${ep.episode}", color = Color.White, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                            if (ep.available == true) Icon(Icons.Filled.PlayArrow, null, tint = Color.White)
                            else Text("próx.", color = Muted, fontSize = 11.sp)
                        }
                    }
                }
            }
        }
        IconButton(onClick = { vm.closeDetail() }, modifier = Modifier.align(Alignment.TopEnd).padding(8.dp)) {
            Icon(Icons.Filled.Close, "Cerrar", tint = Color.White)
        }
    }
}

@Composable
private fun DetailHeader(image: String?, title: String, meta: String, genres: String) {
    Box(Modifier.fillMaxWidth().height(220.dp)) {
        AsyncImage(image, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Bg))))
    }
    Text(title, color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(start = 16.dp, top = 6.dp))
    if (meta.isNotBlank()) Text(meta, color = Muted, fontSize = 13.sp, modifier = Modifier.padding(start = 16.dp, top = 4.dp))
    if (genres.isNotBlank()) Text(genres, color = Muted, fontSize = 12.sp, modifier = Modifier.padding(start = 16.dp, top = 2.dp, bottom = 10.dp))
}
