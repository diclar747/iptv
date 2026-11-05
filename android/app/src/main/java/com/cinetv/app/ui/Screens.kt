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
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.shadow
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
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material.icons.filled.Tv
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.mediarouter.app.MediaRouteButton
import com.google.android.gms.cast.framework.CastButtonFactory
import com.google.android.gms.cast.framework.CastContext
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.compose.SubcomposeAsyncImage
import androidx.compose.ui.unit.TextUnit
import com.cinetv.app.data.Card
import com.cinetv.app.data.Comment
import com.cinetv.app.data.CommentReq
import com.cinetv.app.data.CreditReqReq
import com.cinetv.app.data.Net
import com.cinetv.app.data.Profile
import com.cinetv.app.data.ProfileUpdate
import com.cinetv.app.data.ProviderBilling
import com.cinetv.app.data.ReactReq
import com.cinetv.app.data.User
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val Panel = Color(0xFF0A0B10)

@Composable
fun SplashLoading() {
    Box(Modifier.fillMaxSize().background(Bg), contentAlignment = Alignment.Center) {
        Text("LiveTV", color = Red, fontSize = 36.sp, fontWeight = FontWeight.Black)
    }
}

@Composable
fun LoginScreen(vm: AppViewModel) { StudioLoginScreen(vm) }

@Composable
fun MainScreen(vm: AppViewModel) {
    var tab by remember { mutableStateOf(0) }
    var searchOpen by remember { mutableStateOf(false) }
    var panelOpen by remember { mutableStateOf(false) }
    val tabs = listOf(
        "Inicio" to Icons.Filled.Home, "Pelis" to Icons.Filled.Movie,
        "Series" to Icons.Filled.Tv, "En Vivo" to Icons.Filled.LiveTv, "Radios" to Icons.Filled.Radio, "Perfil" to Icons.Filled.Person,
    )
    Scaffold(
        containerColor = Bg,
        bottomBar = {
            NavigationBar(containerColor = StudioSurface, modifier = Modifier.clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))) {
                tabs.forEachIndexed { i, (label, icon) ->
                    NavigationBarItem(
                        selected = tab == i, onClick = { tab = i },
                        icon = { Icon(icon, label) }, label = { Text(label, fontSize = 10.sp) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = StudioAccent, selectedTextColor = StudioAccent, indicatorColor = StudioAccent.copy(alpha = .12f)
                        )
                    )
                }
            }
        }
    ) { pad ->
        Column(Modifier.fillMaxSize().padding(pad)) {
            if (tab != 5) TopBar(vm.user, onSearch = { searchOpen = true }, onProfile = { tab = 5 })
            if (vm.busy) androidx.compose.material3.LinearProgressIndicator(Modifier.fillMaxWidth().height(2.dp), color = StudioAccent)
            vm.error?.let { message ->
                Row(Modifier.fillMaxWidth().background(Color(0xFF2B2020)).padding(start = 16.dp),verticalAlignment = Alignment.CenterVertically) {
                    Text(message,color = Color(0xFFFFCE9A),fontSize = 12.sp,modifier = Modifier.weight(1f))
                    IconButton(onClick = {vm.error = null}) {Icon(Icons.Filled.Close,"Cerrar aviso",tint = Muted,modifier = Modifier.size(17.dp))}
                }
            }
            when (tab) {
                0 -> HomeTab(vm) { tab = it }
                1 -> MoviesTab(vm)
                2 -> GridTab(vm) { Net.api.seriesList() }
                3 -> LiveTab(vm)
                4 -> RadiosTab(vm)
                else -> ProfileScreen(vm, onOpenPanel = { panelOpen = true })
            }
        }
    }
    if (searchOpen) SearchOverlay(vm) { searchOpen = false }
    if (panelOpen) ResellerPanelScreen(onClose = { panelOpen = false })
    vm.detail?.let { DetailOverlay(vm, it) }
}

@Composable
private fun TopBar(user: User?, onSearch: () -> Unit, onProfile: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(StudioSurface).padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text("LiveTV", color = Red, fontSize = 24.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.weight(1f))
        CastButton()
        TvSettingsButton()
        IconButton(onClick = onSearch) { Icon(Icons.Filled.Search, "Buscar", tint = Color.White) }
        Box(
            Modifier.size(36.dp).clip(CircleShape).background(Color(0xFF203349)).border(1.dp, StudioAccent.copy(alpha = .25f), CircleShape).clickable { onProfile() },
            contentAlignment = Alignment.Center
        ) {
            Text((user?.username?.firstOrNull() ?: 'U').uppercase(), color = Color.White, fontWeight = FontWeight.Bold)
        }
    }
}

// Botón de Chromecast (MediaRouteButton nativo). Solo aparece si Cast está
// disponible en el dispositivo; al tocarlo muestra los dispositivos para
// proyectar. Igual que el del reproductor, pero accesible desde la navegación.
@Composable
private fun CastButton() {
    val context = LocalContext.current
    val available = remember { runCatching { CastContext.getSharedInstance(context) }.isSuccess }
    if (!available) return
    AndroidView(
        modifier = Modifier.size(40.dp),
        factory = { ctx ->
            MediaRouteButton(ctx).apply {
                CastButtonFactory.setUpMediaRouteButton(ctx.applicationContext, this)
                setAlwaysVisible(true) // mostrar el ícono aunque no haya dispositivos aún
            }
        }
    )
}

// Acción "Transmitir" (Chromecast) con etiqueta, para la barra de acciones de
// la ficha. Siempre visible; al tocarla abre el selector de dispositivos.
@Composable
private fun CastAction() {
    val context = LocalContext.current
    val available = remember { runCatching { CastContext.getSharedInstance(context) }.isSuccess }
    if (!available) return
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        AndroidView(
            modifier = Modifier.size(26.dp),
            factory = { ctx ->
                MediaRouteButton(ctx).apply {
                    CastButtonFactory.setUpMediaRouteButton(ctx.applicationContext, this)
                    setAlwaysVisible(true)
                }
            }
        )
        Spacer(Modifier.height(4.dp))
        Text("Transmitir", color = Muted, fontSize = 11.sp)
    }
}

// Inicio: prioriza los CANALES. Arriba, un carrusel (portada) de canales que
// va rotando con botón "Ver en vivo"; debajo, las filas de canales por país,
// deportes, noticias, etc. Las películas viven en la pestaña Pelis.
@Composable
private fun HomeTab(vm: AppViewModel, onNavigate: (Int) -> Unit) {
    val heroChannels = remember(vm.channelRows) {
        vm.channelRows.flatMap { it.items ?: emptyList() }.distinctBy { it.id }.take(8)
    }
    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        item { StudioShortcuts(onNavigate) }
        if (heroChannels.isNotEmpty()) item { ChannelHero(heroChannels, onPlay = { vm.playChannel(it) }, onOpen = { vm.openCard(it) }) }
        items(vm.channelRows) { row ->
            if (!row.items.isNullOrEmpty()) {
                Text(row.title ?: "", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = 14.dp, top = 16.dp, bottom = 8.dp))
                LazyRow(contentPadding = PaddingValues(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(row.items) { CardView(it) { if(it.kind == "channel") vm.playChannel(it) else vm.openCard(it) } }
                }
            }
        }
        if (vm.channelRows.isEmpty()) {
            item {
                Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
                    val err = vm.error
                    if (err != null) {
                        // Antes quedaba el spinner girando para siempre sin indicio
                        // de la causa; ahora se ve el error y se puede reintentar.
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("No se pudo cargar", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(6.dp))
                            Text(err, color = Red, fontSize = 13.sp, textAlign = TextAlign.Center)
                            Spacer(Modifier.height(14.dp))
                            Button(onClick = { vm.refreshHome() }, colors = ButtonDefaults.buttonColors(containerColor = Red)) {
                                Text("Reintentar")
                            }
                        }
                    } else {
                        CircularProgressIndicator(color = Red)
                    }
                }
            }
        }
    }
}

// Portada/carrusel de canales a todo el ancho (cover): el logo grande y
// difuminado llena todo el encabezado como fondo, con un logo nítido centrado,
// badge EN VIVO, nombre grande y botón "Ver en vivo". Rota solo.
@Composable
private fun ChannelHero(channels: List<Card>, onPlay: (Card) -> Unit, onOpen: (Card) -> Unit) {
    StudioChannelShowcase(channels, onPlay, onOpen)
}

@Composable
private fun LiveChip(modifier: Modifier = Modifier) {
    Row(
        modifier.clip(RoundedCornerShape(6.dp)).background(Color(0xE6E50914)).padding(horizontal = 9.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(Color.White))
        Spacer(Modifier.width(5.dp))
        Text("EN VIVO", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Black)
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

// Pelis: la portada de películas (banner) vive acá, arriba de la grilla, con
// el filtro de categorías. Scrollea junto con la grilla.
@Composable
private fun MoviesTab(vm: AppViewModel) {
    var cat by remember { mutableStateOf<String?>(null) }
    val cats = vm.meta?.categories.orEmpty()
    GridTab(vm, key = cat, header = {
        Column {
            if (vm.featured.isNotEmpty()) Banner(vm)
            if (cats.isNotEmpty()) {
                LazyRow(contentPadding = PaddingValues(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { Chip("Todas", cat == null) { cat = null } }
                    items(cats) { c -> Chip(c.name ?: c.id ?: "", cat == c.id) { cat = c.id } }
                }
            }
        }
    }) { Net.api.movies(category = cat) }
}

@Composable
private fun Chip(label: String, selected: Boolean, onClick: () -> Unit) {
    FilterChip(
        selected = selected, onClick = onClick,
        label = { Text(label, fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium) },
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = Red, selectedLabelColor = Color.White,
            containerColor = Color(0xFF262B36), labelColor = Color(0xFFD9DEE7)
        )
    )
}

@Composable
private fun LiveTab(vm: AppViewModel) { StudioLiveTab(vm) }

@Composable
private fun GridTab(vm: AppViewModel, key: Any? = Unit, minCell: Dp = 112.dp, header: (@Composable () -> Unit)? = null, loader: suspend () -> List<Card>) {
    var items by remember(key) { mutableStateOf<List<Card>?>(null) }
    LaunchedEffect(key) { items = try { loader() } catch (_: Exception) { emptyList() } }
    val list = items
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minCell), contentPadding = PaddingValues(12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        header?.let { h -> item(span = { GridItemSpan(maxLineSpan) }) { h() } }
        if (list == null) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Red) }
            }
        } else {
            items(list) { card ->
                // En grilla la tarjeta ocupa toda la celda (uniforme y responsive).
                if (card.kind == "channel") ChannelCard(card, Modifier.fillMaxWidth()) { vm.openCard(card) }
                else PosterCard(card, Modifier.fillMaxWidth()) { vm.openCard(card) }
            }
        }
    }
}

// Elige la tarjeta según el tipo: canal -> tile de logo; peli/serie -> póster.
@Composable
private fun CardView(card: Card, onClick: () -> Unit) {
    if (card.kind == "channel") ChannelCard(card, Modifier.width(150.dp), onClick)
    else PosterCard(card, Modifier.width(118.dp), onClick)
}

@Composable
private fun PosterCard(card: Card, modifier: Modifier = Modifier.width(118.dp), onClick: () -> Unit) {
    Column(modifier.clickable { onClick() }) {
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

// Tarjeta de canal: tile 16:10 uniforme con fondo OSCURO moderno (igual que la
// web), borde sutil y sombra, logo centrado SIN recortar (Fit) ocupando una
// fracción fija del tile para que todos se vean del mismo tamaño, con badge
// "EN VIVO".
private val LogoTile = Brush.linearGradient(listOf(Color(0xFF1B1F28), Color(0xFF101217)))
private val TileBorder = Color(0x14FFFFFF) // blanco 8% para el borde sutil

// Logo de canal con respaldo: si la imagen no existe O FALLA al cargar, muestra
// el nombre. Antes, un logo que no cargaba (p. ej. http bloqueado) dejaba el
// tile vacío; ahora siempre se ve algo.
@Composable
private fun ChannelLogo(
    logo: String?, title: String, imageModifier: Modifier,
    fontSize: TextUnit = 15.sp, textPadding: Dp = 10.dp,
) {
    val fallback: @Composable () -> Unit = {
        Text(
            title, color = Color.White, fontSize = fontSize, fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(textPadding)
        )
    }
    if (logo == null) { fallback(); return }
    SubcomposeAsyncImage(
        model = logo, contentDescription = title, contentScale = ContentScale.Fit,
        modifier = imageModifier, error = { fallback() }
    )
}

@Composable
private fun ChannelCard(card: Card, modifier: Modifier = Modifier.width(150.dp), onClick: () -> Unit) {
    StudioChannelCard(card, modifier, onPlay = onClick)
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
private fun ProfileScreen(vm: AppViewModel, onOpenPanel: () -> Unit) {
    val u = vm.user ?: return
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val isReseller = u.role == "reseller"
    val isAdmin = u.role == "admin"
    val staff = isReseller || isAdmin
    var favs by remember { mutableStateOf<List<Card>>(emptyList()) }
    var prof by remember { mutableStateOf<Profile?>(null) }
    var provider by remember { mutableStateOf<ProviderBilling?>(null) }
    var upPending by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        favs = try { Net.api.favorites() } catch (_: Exception) { emptyList() }
        prof = try { Net.api.profile() } catch (_: Exception) { null }
        if (!isAdmin) provider = try { Net.api.billingProvider() } catch (_: Exception) { null }
        if (u.role == "client") upPending = try {
            Net.api.myCreditRequests().any { it.kind == "upgrade" && it.status == "pending" }
        } catch (_: Exception) { false }
    }

    // Formulario de datos (incluye bancarios); se inicializa al llegar el perfil.
    var displayName by remember(prof) { mutableStateOf(prof?.displayName ?: "") }
    var phone by remember(prof) { mutableStateOf(prof?.phone ?: "") }
    var bankName by remember(prof) { mutableStateOf(prof?.bankName ?: "") }
    var bankHolder by remember(prof) { mutableStateOf(prof?.bankHolder ?: "") }
    var bankAccount by remember(prof) { mutableStateOf(prof?.bankAccount ?: "") }
    var bankAlias by remember(prof) { mutableStateOf(prof?.bankAlias ?: "") }
    var bankDoc by remember(prof) { mutableStateOf(prof?.bankDoc ?: "") }

    fun saveProfile() {
        scope.launch {
            try {
                prof = Net.api.updateProfile(ProfileUpdate(
                    displayName = displayName, phone = phone, bankName = bankName, bankHolder = bankHolder,
                    bankAccount = bankAccount, bankAlias = bankAlias, bankDoc = bankDoc))
                msg = "Guardado ✓"
            } catch (e: Exception) { msg = e.message }
        }
    }
    fun askUpgrade() {
        scope.launch {
            try { Net.api.createCreditRequest(CreditReqReq("upgrade", 0)); upPending = true; msg = "Solicitud enviada ✓" }
            catch (e: Exception) { msg = e.message }
        }
    }

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
                if (isReseller) {
                    InfoRow("Saldo", (u.credits ?: 0).toString())
                    InfoRow("Enlace de afiliado", "live.cd.com.py/?ref=${u.username}")
                }
                if (u.role == "client") {
                    InfoRow("Suscripción", if (u.subscription?.active == true) "Activa" else "Vencida")
                    u.packageName?.let { InfoRow("Paquete", it) }
                    u.expiresAt?.let { InfoRow("Vence", it.take(10)) }
                    InfoRow("Pantallas", (u.maxConnections ?: 1).toString())
                }
                if (isAdmin) InfoRow("Rol", "Administrador")

                Spacer(Modifier.height(16.dp))
                if (staff) {
                    Button(
                        onClick = {
                            if (isReseller) onOpenPanel()
                            else runCatching { ctx.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse("https://live.cd.com.py"))) }
                        },
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Red)
                    ) { Text("Panel de gestión", fontWeight = FontWeight.Bold) }
                    Spacer(Modifier.height(16.dp))
                }

                // Datos + datos bancarios (staff)
                if (staff) {
                    Text("Datos bancarios", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    Text(if (isAdmin) "Tus distribuidores los ven para pagarte." else "Tus clientes los ven para pagarte.",
                        color = Muted, fontSize = 12.sp, modifier = Modifier.padding(vertical = 4.dp))
                    ProfileField("Nombre / Negocio", displayName) { displayName = it }
                    ProfileField("Teléfono / WhatsApp", phone) { phone = it }
                    ProfileField("Banco", bankName) { bankName = it }
                    ProfileField("Titular", bankHolder) { bankHolder = it }
                    ProfileField("Nº de cuenta", bankAccount) { bankAccount = it }
                    ProfileField("Alias", bankAlias) { bankAlias = it }
                    ProfileField("Cédula / RUC", bankDoc) { bankDoc = it }
                    Button(onClick = { saveProfile() }, modifier = Modifier.fillMaxWidth().height(46.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Red)) { Text("Guardar datos", fontWeight = FontWeight.Bold) }
                    Spacer(Modifier.height(16.dp))
                }

                // Cómo pagar al proveedor (distribuidor ve al admin; cliente a su vendedor)
                if (!isAdmin) {
                    val p = provider
                    val hasBank = p != null && (!p.bankName.isNullOrBlank() || !p.bankAccount.isNullOrBlank() || !p.bankAlias.isNullOrBlank())
                    Text(if (isReseller) "Cómo pagar tu saldo" else "Cómo pagar", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    if (hasBank) {
                        Text("Transferí a ${p!!.displayName ?: p.username ?: "tu proveedor"} y enviá el comprobante.",
                            color = Muted, fontSize = 12.sp, modifier = Modifier.padding(vertical = 4.dp))
                        p.bankName?.let { InfoRow("Banco", it) }
                        p.bankHolder?.let { InfoRow("Titular", it) }
                        p.bankAccount?.let { InfoRow("Cuenta", it) }
                        p.bankAlias?.let { InfoRow("Alias", it) }
                        p.bankDoc?.let { InfoRow("CI/RUC", it) }
                        p.phone?.let { InfoRow("WhatsApp", it) }
                    } else {
                        Text("Tu proveedor todavía no cargó sus datos de pago. Contactalo para renovar o ampliar tu acceso." +
                            (p?.phone?.let { " ($it)" } ?: ""), color = Muted, fontSize = 13.sp, modifier = Modifier.padding(vertical = 4.dp))
                    }
                    Spacer(Modifier.height(16.dp))
                }

                // Cliente: convertirse en distribuidor
                if (u.role == "client") {
                    Text("¿Querés vender LiveTV?", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    Text("Convertite en distribuidor: comprás saldo y revendés a tus clientes al precio que quieras.",
                        color = Muted, fontSize = 12.sp, modifier = Modifier.padding(vertical = 4.dp))
                    if (upPending) {
                        Text("Solicitud enviada ⏳ — esperando aprobación.", color = Red, fontSize = 13.sp)
                    } else {
                        Button(onClick = { askUpgrade() }, modifier = Modifier.fillMaxWidth().height(46.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Red)) { Text("Quiero ser distribuidor", fontWeight = FontWeight.Bold) }
                    }
                    Spacer(Modifier.height(16.dp))
                }

                msg?.let { Text(it, color = Red, fontSize = 13.sp, modifier = Modifier.padding(bottom = 8.dp)) }
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

@Composable
private fun ProfileField(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value, onChange, label = { Text(label) }, singleLine = true,
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
    )
}

private fun roleLabel(r: String?) = when (r) {
    "admin" -> "Administrador"; "reseller" -> "Vendedor"; "client" -> "Cliente"; else -> r ?: ""
}

// Sección social compartida (backend): Me gusta con contador, Mi Lista (solo
// pelis/series), Compartir, y comentarios reales con autor y borrado propio.
@Composable
private fun SocialSection(vm: AppViewModel, type: String, id: String, title: String, allowList: Boolean) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var inList by remember(id) { mutableStateOf(false) }
    var comments by remember(id) { mutableStateOf<List<Comment>>(emptyList()) }
    var draft by remember(id) { mutableStateOf("") }
    var sending by remember(id) { mutableStateOf(false) }

    LaunchedEffect(id) {
        try {
            val r = Net.api.reactions(type, id)
            comments = r.comments
        } catch (_: Exception) { /* sin reacciones */ }
    }

    VoteButtons(type, id)
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(28.dp)) {
        if (allowList) {
            ActionBtn(Icons.Filled.Add, if (inList) "✓ Mi Lista" else "Mi Lista", if (inList) Red else Color.White) {
                if (!inList) { id.toLongOrNull()?.let { vm.addFavorite(if (type == "serie") "serie" else "movie", it) }; inList = true }
            }
        }
        ActionBtn(Icons.Filled.Share, "Compartir", Color.White) {
            val txt = if (type == "channel") "Mirá $title en vivo por LiveTV 📺 https://live.cd.com.py"
                      else "Mirá \"$title\" en LiveTV 🎬 https://live.cd.com.py"
            val i = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                this.type = "text/plain"
                putExtra(android.content.Intent.EXTRA_TEXT, txt)
            }
            ctx.startActivity(android.content.Intent.createChooser(i, "Compartir"))
        }
        CastAction()
    }

    Text(
        "Comentarios" + if (comments.isNotEmpty()) " (${comments.size})" else "",
        color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(start = 16.dp, top = 4.dp, bottom = 8.dp)
    )
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            draft, { draft = it }, placeholder = { Text("Escribí un comentario…") },
            singleLine = true, modifier = Modifier.weight(1f)
        )
        Spacer(Modifier.width(8.dp))
        IconButton(enabled = draft.isNotBlank() && !sending, onClick = {
            val text = draft.trim()
            if (text.isNotEmpty()) {
                sending = true
                scope.launch {
                    try {
                        val c = Net.api.addComment(CommentReq(type, id, text))
                        comments = listOf(c) + comments; draft = ""
                    } catch (_: Exception) { /* reintentar */ }
                    sending = false
                }
            }
        }) { Icon(Icons.Filled.Send, "Enviar", tint = if (draft.isNotBlank()) Red else Muted) }
    }
    Spacer(Modifier.height(6.dp))
    if (comments.isEmpty()) {
        Text("Sé el primero en comentar.", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
    } else {
        comments.forEach { c ->
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(c.author ?: "—", color = Red, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.weight(1f))
                    if (c.mine) {
                        Text("Borrar", color = Muted, fontSize = 12.sp, modifier = Modifier.clickable {
                            scope.launch {
                                try { Net.api.deleteComment(c.id); comments = comments.filterNot { it.id == c.id } }
                                catch (_: Exception) { /* ignore */ }
                            }
                        })
                    }
                }
                Text(c.body ?: "", color = Color(0xFFC7CBD4), fontSize = 14.sp, modifier = Modifier.padding(top = 2.dp))
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFF1C1D25)))
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
    val ctx = LocalContext.current
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
                            } else if (!d.trailer.isNullOrBlank()) {
                                Button(onClick = {
                                    runCatching { ctx.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(d.trailer))) }
                                }, colors = ButtonDefaults.buttonColors(containerColor = Red)) {
                                    Icon(Icons.Filled.PlayArrow, null); Text(" Ver tráiler", fontWeight = FontWeight.Bold)
                                }
                            } else Text("Próximamente — sin fuente disponible", color = Muted, fontSize = 13.sp)
                        }
                        d.overview?.let { Text(it, color = Color(0xFFC7CBD4), fontSize = 14.sp, modifier = Modifier.padding(16.dp)) }
                        Text("Metadatos por TheTVDB / TMDB", color = Color(0xFF5C6879), fontSize = 11.sp, modifier = Modifier.padding(start = 16.dp))
                        SocialSection(vm, "movie", d.id.toString(), d.title ?: "", allowList = true)
                    }
                }
                is Detail.Serie -> {
                    val d = detail.d
                    item {
                        DetailHeader(d.backdrop ?: d.poster, d.title ?: "", "${d.episodes?.size ?: 0} episodios", d.genres?.joinToString(" · ") ?: "")
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
                    item { SocialSection(vm, "serie", d.id.toString(), d.title ?: "", allowList = true) }
                }
                is Detail.Channel -> {
                    val c = detail.c
                    item {
                        ChannelHeader(c)
                        Button(
                            onClick = { vm.playChannel(c); vm.closeDetail() },
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp).height(52.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Red)
                        ) {
                            Icon(Icons.Filled.PlayArrow, null); Text("  Ver en vivo", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        }
                        Text("Señal en vivo vía LiveTV", color = Color(0xFF5C6879), fontSize = 11.sp, modifier = Modifier.padding(start = 16.dp, top = 2.dp))
                        SocialSection(vm, "channel", c.id, c.displayTitle, allowList = false)
                    }
                }
            }
        }
        IconButton(onClick = { vm.closeDetail() }, modifier = Modifier.align(Alignment.TopEnd).padding(8.dp)) {
            Icon(Icons.Filled.Close, "Cerrar", tint = Color.White)
        }
    }
}

// Cabecera de canal moderna: hero con degradado y el logo en una tarjeta
// elevada (mismo lenguaje que los tiles: oscuro, borde sutil y sombra), badge
// EN VIVO, título grande y chips de país/categoría.
@Composable
private fun ChannelHeader(card: Card) { StudioChannelHeader(card) }

@Composable
private fun HeaderPill(text: String) {
    Text(
        text, color = Color(0xFFC7CBD4), fontSize = 12.sp,
        modifier = Modifier.clip(RoundedCornerShape(20.dp)).background(Color(0xFF1B1F28))
            .border(1.dp, Color(0x14FFFFFF), RoundedCornerShape(20.dp)).padding(horizontal = 12.dp, vertical = 5.dp)
    )
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
