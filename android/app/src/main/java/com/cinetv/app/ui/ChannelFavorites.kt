package com.cinetv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import com.cinetv.app.data.Card
import com.cinetv.app.data.Net
import com.cinetv.app.data.NotificationInbox
import com.cinetv.app.data.NotificationRead
import kotlinx.coroutines.launch

val LocalChannelFavorites=staticCompositionLocalOf<AppViewModel?>{null}
private val FavoriteGold=Color(0xFFFFDC71)

@Composable
fun ChannelFavoriteButton(card:Card,modifier:Modifier=Modifier){
    val vm=LocalChannelFavorites.current?:return
    val saved=vm.channelFavorites.any{it.id==card.id}
    IconButton(onClick={vm.toggleChannelFavorite(card)},enabled=!vm.favoritesBusy&&!vm.favoritesLoading,modifier=modifier.size(44.dp)){
        Icon(if(saved)Icons.Default.Star else Icons.Default.StarBorder,(if(saved)"Quitar de favoritos: " else "Agregar a favoritos: ")+card.displayTitle,tint=if(saved)FavoriteGold else Color.White)
    }
}

@Composable
fun FavoriteChannelsRow(vm:AppViewModel,onSeeAll:()->Unit){
    if(vm.channelFavorites.isEmpty())return
    Column {
        Row(Modifier.fillMaxWidth().padding(horizontal=16.dp),verticalAlignment=Alignment.CenterVertically){
            Text("Mis canales favoritos",color=Color.White,fontSize=18.sp,fontWeight=FontWeight.Bold,modifier=Modifier.weight(1f))
            TextButton(onClick=onSeeAll){Text("Ver todos",color=FavoriteGold)}
        }
        LazyRow(contentPadding=PaddingValues(horizontal=16.dp),horizontalArrangement=Arrangement.spacedBy(10.dp)){
            items(vm.channelFavorites,key={it.id}){c->StudioChannelCard(c,Modifier.width(160.dp),onPlay={vm.playChannel(c)})}
        }
    }
}

@Composable
fun FavoriteChannelsScreen(vm:AppViewModel,onExplore:()->Unit){
    LazyVerticalGrid(columns=GridCells.Adaptive(150.dp),contentPadding=PaddingValues(16.dp),horizontalArrangement=Arrangement.spacedBy(10.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
        item(span={GridItemSpan(maxLineSpan)}){Column{Text("Mis canales favoritos",color=Color.White,fontSize=23.sp,fontWeight=FontWeight.Bold);Text("Tu lista se comparte con la web. Tocá la estrella para agregar o quitar un canal.",color=Muted,fontSize=13.sp,modifier=Modifier.padding(vertical=12.dp));TextButton(onClick=onExplore){Text("Explorar canales",color=StudioAccent)}}}
        if(vm.favoritesLoading&&vm.channelFavorites.isEmpty())item(span={GridItemSpan(maxLineSpan)}){CircularProgressIndicator(color=StudioAccent)}
        else if(vm.channelFavorites.isEmpty())item(span={GridItemSpan(maxLineSpan)}){Text("Todavía no tenés favoritos. Buscá tus canales en En Vivo y tocá ☆.",color=Color.White,modifier=Modifier.padding(vertical=20.dp))}
        items(vm.channelFavorites,key={it.id}){c->StudioChannelCard(c,Modifier.fillMaxWidth(),onPlay={vm.playChannel(c)})}
    }
}

@Composable
fun NotificationScreen(onClose:()->Unit,onAccount:()->Unit){
    var inbox by remember{mutableStateOf(NotificationInbox())}
    var loading by remember{mutableStateOf(true)}
    var error by remember{mutableStateOf<String?>(null)}
    val scope=rememberCoroutineScope()
    LaunchedEffect(Unit){try{inbox=Net.api.notifications()}catch(e:kotlinx.coroutines.CancellationException){throw e}catch(_:Exception){error="No pudimos cargar las notificaciones."}finally{loading=false}}
    Column(Modifier.fillMaxSize().background(Bg).padding(16.dp)){
        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text("Notificaciones",fontSize=23.sp,fontWeight=FontWeight.Bold,color=Color.White,modifier=Modifier.weight(1f));IconButton(onClick=onClose){Icon(Icons.Default.Close,"Cerrar notificaciones",tint=Color.White)}}
        error?.let{Text(it,color=Color(0xFFFFC87F))}
        if(loading)CircularProgressIndicator(color=StudioAccent)
        if(inbox.items.any{it.id.toLongOrNull()?.let{n->n>(inbox.lastRead.toLongOrNull()?:0)}==true})TextButton(onClick={scope.launch{try{val id=inbox.items.first().id;Net.api.readNotifications(NotificationRead(id));inbox=inbox.copy(lastRead=id)}catch(e:kotlinx.coroutines.CancellationException){throw e}catch(_:Exception){error="No pudimos marcar los avisos como leídos."}}}){Text("Marcar como leídas",color=StudioAccent)}
        LazyColumn(verticalArrangement=Arrangement.spacedBy(12.dp)){
            if(!loading&&inbox.items.isEmpty())item{Text("No tenés avisos todavía.",color=Muted)}
            items(inbox.items,key={it.id}){n->Column(Modifier.fillMaxWidth().background(StudioSurface).padding(16.dp)){
                Text(n.title,color=Color.White,fontWeight=FontWeight.Bold)
                Text(n.body,color=Color(0xFFC9D6E3),modifier=Modifier.padding(vertical=8.dp),fontSize=14.sp)
                n.created_at?.let{date->Text(runCatching{java.time.Instant.parse(date).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))}.getOrDefault(date),color=Muted,fontSize=12.sp)}
                TextButton(onClick=onAccount){Text("Ver mi cuenta →",color=StudioAccent)}
            }}
        }
    }
}
