package com.cinetv.app
import android.content.Context
object AppSettings {
 private lateinit var context:Context
 fun init(c:Context){context=c.applicationContext}
 private val prefs get()=context.getSharedPreferences("livetv_settings",Context.MODE_PRIVATE)
 var background:Boolean
  get()=prefs.getBoolean("background",true)
  set(value){prefs.edit().putBoolean("background",value).apply()}
 var keepScreenOn:Boolean
  get()=prefs.getBoolean("keepScreenOn",true)
  set(value){prefs.edit().putBoolean("keepScreenOn",value).apply()}
 var notifications:Boolean
  get()=prefs.getBoolean("notifications",true)
  set(value){prefs.edit().putBoolean("notifications",value).apply();if(value)AccountNotificationJob.schedule(context)else{context.getSystemService(android.app.job.JobScheduler::class.java).cancel(42031);val manager=context.getSystemService(android.app.NotificationManager::class.java);manager.activeNotifications.filter{it.notification.channelId=="account"}.forEach{manager.cancel(it.id)}}}
}
