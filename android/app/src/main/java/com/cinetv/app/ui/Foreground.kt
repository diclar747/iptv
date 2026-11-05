package com.cinetv.app.ui

import android.content.Context
import android.content.ContextWrapper
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner

// Playback may continue in the service; UI polling stops when the app is hidden.
@Composable
internal fun rememberForeground(): Boolean {
 val context=LocalContext.current
 val lifecycle=remember(context){
  var candidate:Context?=context
  var owner:LifecycleOwner?=null
  while(candidate!=null){
   if(candidate is LifecycleOwner){owner=candidate;break}
   val next=(candidate as? ContextWrapper)?.baseContext
   if(next===candidate)break
   candidate=next
  }
  owner?.lifecycle
 }
 var active by remember(lifecycle){mutableStateOf(lifecycle?.currentState?.isAtLeast(Lifecycle.State.STARTED)?:true)}
 DisposableEffect(lifecycle){
  val observer=LifecycleEventObserver{_,_->active=lifecycle?.currentState?.isAtLeast(Lifecycle.State.STARTED)?:true}
  lifecycle?.addObserver(observer)
  onDispose{lifecycle?.removeObserver(observer)}
 }
 return active
}
