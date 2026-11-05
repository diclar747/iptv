package com.cinetv.app.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cinetv.app.data.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException

private val SocialMint=Color(0xFF54F1BF)
private val reactionEmojis=listOf("👍","👎")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SocialActions(target: PlayTarget) {
 var show by remember(target.reactionId) { mutableStateOf(false) }
 val context=LocalContext.current
 Column {
  VoteButtons(target.reactionType,target.reactionId)
  Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {
   TextButton(onClick={show=true}) { Icon(Icons.Default.ChatBubbleOutline,"Comentarios",Modifier.size(18.dp)); Text(" Conversar",color=Color.White) }
   TextButton(onClick={
    val link=Net.BASE+"?type="+Uri.encode(target.reactionType)+"&play="+Uri.encode(target.reactionId)
    context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type="text/plain";putExtra(Intent.EXTRA_TEXT,"${target.title} · LiveTV\n$link") },"Compartir en…"))
   }) { Icon(Icons.Default.Share,"Compartir",Modifier.size(18.dp));Text(" Compartir",color=Color.White) }
  }
 }
 if(show) ModalBottomSheet(onDismissRequest={show=false},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),modifier=Modifier.fillMaxHeight(.94f),containerColor=Color(0xFF0D1828)) {
  LiveConversation(target,Modifier.fillMaxWidth().weight(1f))
 }
}

@Composable
private fun LiveConversation(target: PlayTarget,modifier:Modifier) {
 var comments by remember(target.reactionId) { mutableStateOf<List<Comment>>(emptyList()) }
 var draft by remember { mutableStateOf("") }
 var busy by remember { mutableStateOf(false) }
 var picker by remember { mutableStateOf(false) }
 var error by remember { mutableStateOf<String?>(null) }
 val scope=rememberCoroutineScope()
 val foreground=rememberForeground()
 LaunchedEffect(target.reactionType,target.reactionId,foreground) {
  if(!foreground)return@LaunchedEffect
  while(true) {
   try {comments=Net.api.reactions(target.reactionType,target.reactionId).comments;error=null}
   catch(e:CancellationException){throw e} catch(_:Exception){error="No se pudo actualizar. Reintentando…"}
   delay(8000)
  }
 }
 fun action(block:suspend ()->Unit) {
  if(busy)return
  busy=true;error=null
  scope.launch {try{block()}catch(e:CancellationException){throw e}catch(e:Exception){error=if(e is retrofit2.HttpException && e.code()==429)"Esperá unos segundos para enviar otro saludo." else "No se guardó. Volvé a intentar."}finally{busy=false}}
 }
 Column(modifier.navigationBarsPadding().imePadding().padding(horizontal=14.dp)) {
  Text("Conversación en vivo",color=Color.White,fontSize=19.sp,fontWeight=FontWeight.Bold)
  Text(target.title,color=SocialMint,fontSize=11.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
  error?.let { Text(it,color=Color(0xFFFF8295),fontSize=11.sp) }
  LazyColumn(Modifier.weight(1f).fillMaxWidth().padding(top=10.dp),verticalArrangement=Arrangement.spacedBy(10.dp)) {
   if(comments.isEmpty())item{Text("¡Mandá el primer saludo! 👋",color=Color(0xFF9CADC3),fontSize=13.sp)}
   items(comments,key={it.id}) { c ->
    var menu by remember(c.id){mutableStateOf(false)}
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.Top) {
     Box(Modifier.size(30.dp).clip(CircleShape).background(Color(0xFF38617D)),contentAlignment=Alignment.Center){Text((c.author?:"?").take(2).uppercase(),color=Color.White,fontSize=10.sp,fontWeight=FontWeight.Bold)}
     Column(Modifier.weight(1f)) {
      Column(Modifier.clip(RoundedCornerShape(12.dp)).background(Color(0xFF192A40)).padding(horizontal=10.dp,vertical=8.dp)) {
       Row(horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.CenterVertically){
        Text(c.author?:"Usuario",color=SocialMint,fontWeight=FontWeight.Bold,fontSize=11.sp)
        Text(c.created?.let {runCatching{java.time.Instant.parse(it).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))}.getOrDefault("")}?:"",color=Color(0xFF9CADC3),fontSize=9.sp)
       }
       Text(c.body?:"",color=Color.White,fontSize=13.sp,modifier=Modifier.padding(top=4.dp))
      }
      CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 32.dp) {
       Row(verticalAlignment=Alignment.CenterVertically) {
        reactionEmojis.forEach { emoji ->
         val selected=c.reaction==emoji
         IconButton(onClick={action { val r=Net.api.reactComment(c.id,CommentReactionReq(emoji));comments=comments.map {if(it.id==c.id)it.copy(reaction=r.reaction,reactions=r.reactions) else it} }},enabled=!busy,modifier=Modifier.size(32.dp)) {
          Icon(if(emoji=="👍")Icons.Default.ThumbUp else Icons.Default.ThumbDown,if(emoji=="👍")"Me gusta" else "No me gusta",tint=if(selected)SocialMint else Color(0xFF91A3BB),modifier=Modifier.size(15.dp))
         }
         val count=c.reactions[emoji]?:0
         if(count>0)Text(count.toString(),color=Color(0xFF9CADC3),fontSize=10.sp)
        }
        if(c.mine)Box {
         IconButton(onClick={menu=true},modifier=Modifier.size(32.dp)){Icon(Icons.Default.MoreHoriz,"Opciones del comentario",tint=Color(0xFF91A3BB),modifier=Modifier.size(16.dp))}
         DropdownMenu(expanded=menu,onDismissRequest={menu=false}){DropdownMenuItem(text={Text("Eliminar")},onClick={menu=false;action {Net.api.deleteComment(c.id);comments=comments.filterNot{it.id==c.id}}})}
        }
       }
      }
     }
    }
   }
  }
  HorizontalDivider(color=Color(0xFF24344B))
  Row(Modifier.fillMaxWidth().padding(vertical=6.dp),verticalAlignment=Alignment.Bottom,horizontalArrangement=Arrangement.spacedBy(6.dp)) {
   Box {
    IconButton(onClick={picker=true},modifier=Modifier.size(36.dp)){Icon(Icons.Default.Mood,"Agregar emoji",tint=SocialMint)}
    DropdownMenu(expanded=picker,onDismissRequest={picker=false}){
     listOf("👋","❤️","😂","🎉","🙏","🇵🇾").forEach{emoji->DropdownMenuItem(text={Text(emoji)},onClick={draft=(draft+emoji).take(500);picker=false})}
    }
   }
   OutlinedTextField(value=draft,onValueChange={draft=it.take(500)},placeholder={Text("Escribí un saludo…",fontSize=13.sp)},modifier=Modifier.weight(1f),minLines=1,maxLines=3,shape=RoundedCornerShape(20.dp),colors=OutlinedTextFieldDefaults.colors(focusedTextColor=Color.White,unfocusedTextColor=Color.White,focusedBorderColor=SocialMint))
   FilledIconButton(onClick={action {val c=Net.api.addComment(CommentReq(target.reactionType,target.reactionId,draft.trim()));comments=(listOf(c)+comments).distinctBy{it.id};draft=""}},enabled=!busy&&draft.isNotBlank(),modifier=Modifier.size(44.dp)){
    if(busy)CircularProgressIndicator(Modifier.size(18.dp),strokeWidth=2.dp) else Icon(Icons.Default.Send,"Enviar comentario",modifier=Modifier.size(20.dp))
   }
  }
 }
}
