package com.cinetv.app

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.PlaybackException
import androidx.media3.common.AudioAttributes
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.cinetv.app.data.Net
import com.cinetv.app.ui.PlayTarget

object PlaybackHolder {
 @Volatile var player:ExoPlayer?=null
 @Volatile var title:String?=null
 @Volatile var target:PlayTarget?=null
 @Volatile var deadline:Long=Long.MAX_VALUE
}

@androidx.annotation.OptIn(UnstableApi::class)
class PlaybackService:MediaSessionService(){
 private var session:MediaSession?=null
 private val handler=Handler(Looper.getMainLooper())
 private var retries=0
 private val expiry=object:Runnable{override fun run(){if(System.currentTimeMillis()>=PlaybackHolder.deadline){PlaybackHolder.player?.stop();stopSelf()}else handler.postDelayed(this,minOf(60000L,PlaybackHolder.deadline-System.currentTimeMillis()).coerceAtLeast(1))}}
 override fun onCreate(){
  super.onCreate()
  applicationContextRef=applicationContext
  val player=obtainPlayer(this)
  val intent=Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
  val pending=PendingIntent.getActivity(this,0,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  session=MediaSession.Builder(this,player).setSessionActivity(pending).build()
  session?.let{addSession(it)}
  player.addListener(object:Player.Listener{
   override fun onPlayerError(error:PlaybackException){
    var cause:Throwable?=error;var denied=false
    while(cause!=null){if(cause is androidx.media3.datasource.HttpDataSource.InvalidResponseCodeException&&cause.responseCode in listOf(401,403))denied=true;cause=cause.cause}
    if(denied){player.stop();stopSelf();return}
    if(PlaybackHolder.target?.isLive!=true||retries>=20)return
    val backoff=minOf(10000L,500L*(1L shl minOf(retries++,4)))
    handler.postDelayed({if(PlaybackHolder.player===player&&player.playWhenReady&&System.currentTimeMillis()<PlaybackHolder.deadline){player.prepare();player.seekToDefaultPosition();player.play()}},backoff)
   }
   override fun onPlaybackStateChanged(state:Int){if(state==Player.STATE_READY)retries=0;if(state==Player.STATE_ENDED&&PlaybackHolder.target?.isLive==true){player.seekToDefaultPosition();player.prepare();player.play()}}
   override fun onIsPlayingChanged(isPlaying:Boolean){handler.removeCallbacks(expiry);if(isPlaying)handler.post(expiry)}
  })
 }
 override fun onGetSession(controllerInfo:MediaSession.ControllerInfo):MediaSession?=session
 override fun onTaskRemoved(rootIntent:Intent?){if(!AppSettings.background||PlaybackHolder.player?.playWhenReady!=true){PlaybackHolder.player?.stop();stopSelf()}}
 override fun onDestroy(){handler.removeCallbacksAndMessages(null);session?.release();session=null;PlaybackHolder.player?.release();PlaybackHolder.player=null;PlaybackHolder.target=null;PlaybackHolder.title=null;super.onDestroy()}
 companion object{
  private var applicationContextRef:Context?=null
  fun obtainPlayer(context:Context):ExoPlayer{
   applicationContextRef=context.applicationContext
   return PlaybackHolder.player?:ExoPlayer.Builder(context.applicationContext)
    .setMediaSourceFactory(DefaultMediaSourceFactory(OkHttpDataSource.Factory(Net.okHttpMedia)))
    .setLoadControl(DefaultLoadControl.Builder().setBufferDurationsMs(15000,50000,2500,5000).build())
    .build().apply{setWakeMode(C.WAKE_MODE_NETWORK);setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(),true);setHandleAudioBecomingNoisy(true);PlaybackHolder.player=this}
  }
  fun stop(){PlaybackHolder.player?.stop();val stopped=applicationContextRef?.stopService(Intent(applicationContextRef,PlaybackService::class.java))?:false;if(!stopped){PlaybackHolder.player?.release();PlaybackHolder.player=null;PlaybackHolder.target=null}}
 }
}
