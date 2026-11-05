package com.cinetv.app.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cinetv.app.R

@Composable
fun LiveTVIntro(){
 val entrance=remember{Animatable(0f)}
 LaunchedEffect(Unit){entrance.animateTo(1f,tween(650,easing=FastOutSlowInEasing))}
 val motion=rememberInfiniteTransition(label="broadcast")
 val phase by motion.animateFloat(0f,1f,infiniteRepeatable(tween(2600,easing=LinearEasing)),label="signal")
 BoxWithConstraints(Modifier.fillMaxSize().background(Color(0xFF060C18))){
  val compact=maxHeight<460.dp
  Image(painterResource(R.drawable.live_studio),null,Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
  Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xAA06101D),Color(0xE207101E),Color(0xFF060C18)))))
  Canvas(Modifier.fillMaxSize()){
   val center=Offset(size.width*.5f,size.height*.43f)
   drawCircle(Brush.radialGradient(listOf(Color(0x304BE3B1),Color.Transparent),center,size.width*.7f),size.width*.7f,center)
   for(index in 0..2){val p=(phase+index/3f)%1f;drawCircle(Color(0xFF54E3BA).copy(alpha=(1f-p)*.16f),size.width*(.2f+p*.6f),center,style=Stroke(1.dp.toPx()))}
   drawCircle(Brush.radialGradient(listOf(Color(0x35734DE7),Color.Transparent),Offset(size.width*.9f,size.height*.15f),size.width*.7f),size.width*.7f,Offset(size.width*.9f,size.height*.15f))
  }
  Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(if(compact)18.dp else 28.dp).graphicsLayer{alpha=entrance.value;translationY=(1f-entrance.value)*24f},horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center){
   if(!compact)Text("UNA SEÑAL. MUCHAS HISTORIAS.",color=Color(0xFF85A5B8),fontSize=9.sp,letterSpacing=2.sp,modifier=Modifier.padding(bottom=38.dp))
   Box(Modifier.size(if(compact)36.dp else 92.dp).clip(RoundedCornerShape(28.dp)).background(Brush.linearGradient(listOf(Color(0xFF1B414B),Color(0xFF142139)))).border(1.dp,Color(0xFF3E7B7A),RoundedCornerShape(28.dp)),contentAlignment=Alignment.Center){
    Icon(Icons.Default.PlayArrow,null,tint=StudioAccent,modifier=Modifier.size(if(compact)26.dp else 62.dp))
   }
   Text("LiveTV",color=Color.White,fontSize=if(compact)32.sp else 54.sp,fontWeight=FontWeight.Bold,letterSpacing=(-2).sp,modifier=Modifier.padding(top=if(compact)8.dp else 14.dp))
   Text("Tu mundo, en directo.",color=Color(0xFFB8C9D9),fontSize=if(compact)12.sp else 15.sp,modifier=Modifier.padding(top=if(compact)4.dp else 6.dp))
   if(!compact)Row(Modifier.padding(top=30.dp),horizontalArrangement=Arrangement.spacedBy(12.dp)){
    listOf(Icons.Default.LiveTv to "TV EN VIVO",Icons.Default.Radio to "RADIO",Icons.Default.Movie to "CINE").forEach{(icon,label)->
     Column(Modifier.clip(RoundedCornerShape(15.dp)).background(Color(0x99162436)).border(1.dp,Color(0xFF293D55),RoundedCornerShape(15.dp)).padding(horizontal=15.dp,vertical=12.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(7.dp)){
      Icon(icon,null,tint=StudioAccent,modifier=Modifier.size(20.dp));Text(label,color=Color(0xFFB9CADD),fontSize=8.sp,letterSpacing=1.sp)
     }
    }
   }
   LinearProgressIndicator(Modifier.padding(top=if(compact)12.dp else 44.dp).width(120.dp).height(2.dp),color=StudioAccent,trackColor=Color(0xFF25384C))
   Text("Preparando tu próxima conexión",color=Color(0xFF7D94AF),fontSize=10.sp,modifier=Modifier.padding(top=12.dp))
  }
  if(!compact)Text("HECHO PARA CONECTARNOS",color=Color(0xFF536B83),fontSize=8.sp,letterSpacing=2.sp,modifier=Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom=24.dp))
 }
}
