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
private val reactionEmojis=listOf("👍","❤️","😂","🎉","🙏")

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
 if(show) ModalBottomSheet(onDismissRequest={show=false},containerColor=Color(0xFF0D1828)) {
  LiveConversation(target,Modifier.fillMaxWidth().fillMaxHeight(.88f))
 }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LiveConversation(target: PlayTarget,modifier:Modifier) {
 var comments by remember(target.reactionId) { mutableStateOf<List<Comment>>(emptyList()) }
 var draft by remember { mutableStateOf("") }
 var busy by remember { mutableStateOf(false) }
 var error by remember { mutableStateOf<String?>(null) }
 val scope=rememberCoroutineScope()
 LaunchedEffect(target.reactionType,target.reactionId) {
  while(true) { try {comments=Net.api.reactions(target.reactionType,target.reactionId).comments} catch(e:CancellationException){throw e} catch(_:Exception){error="No se pudo actualizar. Reintentando…"};delay(5000) }
 }
 fun action(block:suspend ()->Unit) { if(busy)return;busy=true;error=null;scope.launch {try{block()}catch(e:CancellationException){throw e}catch(_:Exception){error="No se guardó. Volvé a intentar."}finally{busy=false}} }
 Column(modifier.imePadding().padding(horizontal=18.dp)) {
  Text("Conversación en vivo",color=Color.White,fontSize=22.sp,fontWeight=FontWeight.Bold)
  Text(target.title+" · Actualización automática",color=SocialMint,fontSize=11.sp)
  error?.let { Text(it,color=Color(0xFFFF8295),fontSize=12.sp) }
  LazyColumn(Modifier.weight(1f).fillMaxWidth().padding(vertical=12.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
   if(comments.isEmpty())item{Text("¡Mandá el primer saludo! 👋",color=Color(0xFF9CADC3))}
   items(comments,key={it.id}) { c ->
    Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {
     Box(Modifier.size(36.dp).clip(CircleShape).background(Color(0xFF38617D)),contentAlignment=Alignment.Center){Text((c.author?:"?").take(2).uppercase(),color=Color.White,fontSize=12.sp,fontWeight=FontWeight.Bold)}
     Column(Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(Color(0xFF192A40)).padding(12.dp)) {
      Text(c.author?:"Usuario",color=SocialMint,fontWeight=FontWeight.Bold,fontSize=13.sp)
      Text(c.created?.replace('T',' ')?.take(16)?:"Ahora",color=Color(0xFF9CADC3),fontSize=10.sp)
      Text(c.body?:"",color=Color.White,modifier=Modifier.padding(vertical=8.dp))
      FlowRow(horizontalArrangement=Arrangement.spacedBy(2.dp),verticalArrangement=Arrangement.spacedBy(4.dp)) { reactionEmojis.forEach { emoji ->
       Surface(onClick={action { val r=Net.api.reactComment(c.id,CommentReactionReq(emoji));comments=comments.map {if(it.id==c.id)it.copy(reaction=r.reaction,reactions=r.reactions) else it} }},enabled=!busy,color=if(c.reaction==emoji)Color(0xFF28584C) else Color(0xFF24344B),shape=RoundedCornerShape(20.dp)) {
        Text(emoji+(c.reactions[emoji]?.let{" $it"}?:""),fontSize=12.sp,modifier=Modifier.padding(horizontal=6.dp,vertical=7.dp),color=Color.White)
       }
      } }
      if(c.mine) TextButton(onClick={action {Net.api.deleteComment(c.id);comments=comments.filterNot{it.id==c.id}}},enabled=!busy){Text("Eliminar",fontSize=11.sp,color=Color(0xFF9CADC3))}
     }
    }
   }
   item{Text("Últimos 100 comentarios",fontSize=10.sp,color=Color(0xFF9CADC3))}
  }
  OutlinedTextField(value=draft,onValueChange={draft=it.take(500)},placeholder={Text("Mandá un saludo… 👋")},modifier=Modifier.fillMaxWidth(),maxLines=3,colors=OutlinedTextFieldDefaults.colors(focusedTextColor=Color.White,unfocusedTextColor=Color.White,focusedBorderColor=SocialMint))
  Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
   listOf("👋","❤️","😂","🎉","🇵🇾").forEach { emoji->TextButton(onClick={draft=(draft+emoji).take(500)},contentPadding=PaddingValues(4.dp),modifier=Modifier.width(34.dp)){Text(emoji)} }
   Spacer(Modifier.weight(1f))
   Button(onClick={action {val c=Net.api.addComment(CommentReq(target.reactionType,target.reactionId,draft.trim()));comments=listOf(c)+comments;draft=""}},enabled=!busy&&draft.isNotBlank()){Text(if(busy)"…" else "Enviar")}
  }
 }
}
