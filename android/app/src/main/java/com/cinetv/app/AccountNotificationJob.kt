package com.cinetv.app

import android.app.job.JobScheduler
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.cinetv.app.data.Net
import okhttp3.Request
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Direct polling of our Node server. Android controls background scheduling. */
class AccountNotificationJob : JobService() {
    private val executor=Executors.newSingleThreadExecutor()
    @Volatile private var stopped=false
    override fun onStartJob(params: JobParameters): Boolean {
        stopped=false
        executor.execute {
            try {
                val client=Net.okHttp.newBuilder().callTimeout(20,TimeUnit.SECONDS).build()
                val sid=client.cookieJar.loadForRequest(Net.BASE.toHttpUrl()).find{it.name=="sid"}?.value
                client.newCall(Request.Builder().url(Net.BASE+"api/notifications").build()).execute().use { response ->
                    if(response.isSuccessful&&!stopped&&sid==client.cookieJar.loadForRequest(Net.BASE.toHttpUrl()).find{it.name=="sid"}?.value){
                        val data=JSONObject(response.body?.string()?:"{}")
                        val owner=data.optString("userId")
                        val prefs=getSharedPreferences("account_notices",Context.MODE_PRIVATE)
                        val items=data.optJSONArray("items")
                        val last=prefs.getLong("cursor_"+owner,0L)
                        val manager=getSystemService(NotificationManager::class.java)
                        manager.createNotificationChannel(NotificationChannel("account","Cuenta y ganancias",NotificationManager.IMPORTANCE_DEFAULT))
                        var newest=last
                        if(items!=null)for(i in items.length()-1 downTo 0){
                            val item=items.getJSONObject(i);val id=item.getLong("id");newest=maxOf(newest,id)
                            if(id<=last||id<=data.optLong("lastRead")||!data.optBoolean("enabled",true))continue
                            val intent=Intent(this,MainActivity::class.java).putExtra("open_wallet",true).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                            val pending=PendingIntent.getActivity(this,id.toInt(),intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                            val notification=NotificationCompat.Builder(this,"account").setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(item.optString("title")).setContentText(item.optString("body")).setStyle(NotificationCompat.BigTextStyle().bigText(item.optString("body"))).setContentIntent(pending).setAutoCancel(true).build()
                            if(!stopped)runCatching{manager.notify((id%2147483647).toInt(),notification)}
                        }
                        if(!stopped)prefs.edit().putLong("cursor_"+owner,newest).apply()
                    }
                }
            }catch(_:Exception){}finally{if(!stopped)jobFinished(params,false)}
        };return true
    }
    override fun onStopJob(params:JobParameters):Boolean{stopped=true;return true}
    override fun onDestroy(){stopped=true;executor.shutdownNow();super.onDestroy()}
    companion object {
        fun schedule(context:Context){context.getSystemService(JobScheduler::class.java).schedule(JobInfo.Builder(42031,ComponentName(context,AccountNotificationJob::class.java)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15*60*1000L).setPersisted(true).build())}
    }
}
