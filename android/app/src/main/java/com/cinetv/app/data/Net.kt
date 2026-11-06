package com.cinetv.app.data

import android.content.Context
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

// Red compartida. Dos clientes, ambos con la MISMA cookie de sesión:
//  · okHttp      -> API (Retrofit): timeouts cortos normales.
//  · okHttpMedia -> reproductor (ExoPlayer): read largo + sin callTimeout +
//                   ping, para que un stream en vivo que titubea no se corte.
object Net {
    private lateinit var appContext:Context
    const val BASE = "https://live.cd.com.py/"
    fun artworkUrl(value: String?): String? = value?.takeIf { it.isNotBlank() }?.let {
        if (it.startsWith("/") && !it.startsWith("//")) BASE.trimEnd('/') + it else it
    }

    lateinit var okHttp: OkHttpClient
        private set
    lateinit var okHttpMedia: OkHttpClient
        private set
    lateinit var playbackApi: Api
        private set
    lateinit var api: Api
        private set

    fun init(ctx: Context) {
        if (::okHttp.isInitialized) return
        appContext=ctx.applicationContext
        val jar = PrefsCookieJar(ctx.applicationContext)
        okHttp = OkHttpClient.Builder()
            .cookieJar(jar)
            .build()
        okHttpMedia = OkHttpClient.Builder()
            .cookieJar(jar)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .callTimeout(0, TimeUnit.MILLISECONDS) // sin tope: vivo continuo
            .pingInterval(20, TimeUnit.SECONDS)    // mantiene viva la conexión HLS
            .retryOnConnectionFailure(true)
            .build()
        playbackApi = Retrofit.Builder().baseUrl(BASE).client(okHttp.newBuilder().readTimeout(35,TimeUnit.SECONDS).callTimeout(40,TimeUnit.SECONDS).build()).addConverterFactory(GsonConverterFactory.create()).build().create(Api::class.java)
        api = Retrofit.Builder()
            .baseUrl(BASE)
            .client(okHttp)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(Api::class.java)
    }

    fun logout(){
        val old=BASE.toHttpUrlOrNull()?.let{okHttp.cookieJar.loadForRequest(it).find{c->c.name=="sid"}?.value}
        (okHttp.cookieJar as? PrefsCookieJar)?.clear()
        android.webkit.CookieManager.getInstance().removeAllCookies(null)
        val manager=appContext.getSystemService(android.app.NotificationManager::class.java)
        manager.activeNotifications.filter{it.notification.channelId=="account"}.forEach{manager.cancel(it.id)}
        if(old!=null)okHttp.newBuilder().cookieJar(CookieJar.NO_COOKIES).build().newCall(okhttp3.Request.Builder().url(BASE+"api/auth/logout").header("Cookie","sid="+old).post(okhttp3.RequestBody.create(null,byteArrayOf())).build()).enqueue(object:okhttp3.Callback{
            override fun onFailure(call:okhttp3.Call,e:java.io.IOException){}
            override fun onResponse(call:okhttp3.Call,response:okhttp3.Response){response.close()}
        })
    }
    // URL de reproducción por el proxy (resuelve cabeceras y auth de sesión).
    fun proxied(rawUrl: String, ua: String? = null, ref: String? = null): String {
        val sb = StringBuilder(BASE).append("api/stream?url=").append(enc(rawUrl))
        if (!ua.isNullOrBlank()) sb.append("&ua=").append(enc(ua))
        if (!ref.isNullOrBlank()) sb.append("&ref=").append(enc(ref))
        return sb.toString()
    }

    // ¿La señal es HLS? Sí si la URL es .m3u8, o si es un link de plataforma
    // (Twitch/YouTube/Facebook/Kick) que el backend RESUELVE a HLS. Sin esto, un
    // link de Twitch (sin ".m3u8") se trataba como MP4 y ExoPlayer no reproducía.
    private val PLATFORMS = Regex(
        "//([a-z0-9-]+\\.)*(twitch\\.tv|youtube\\.com|youtu\\.be|facebook\\.com|fb\\.watch|kick\\.com|dailymotion\\.com|desdeparaguay\\.com)(/|$)",
        RegexOption.IGNORE_CASE
    )
    fun isHls(rawUrl: String?): Boolean {
        if (rawUrl.isNullOrBlank()) return false
        return rawUrl.contains(".m3u8", true) || rawUrl.contains("desdepylabs.com/External/tvaccion/npy",true) || PLATFORMS.containsMatchIn(rawUrl)
    }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
}

// CookieJar mínimo que persiste la sesión entre reinicios de la app.
private class PrefsCookieJar(ctx: Context) : CookieJar {
    private val prefs = ctx.getSharedPreferences("cinetv_cookies", Context.MODE_PRIVATE)
    private val store = mutableListOf<Cookie>()
    @Synchronized fun clear(){store.clear();prefs.edit().remove("cookies").apply()}

    init {
        val base = Net.BASE.toHttpUrlOrNull()
        prefs.getStringSet("cookies", emptySet())?.forEach { raw ->
            if (base != null) Cookie.parse(base, raw)?.let { store.add(it) }
        }
    }

    @Synchronized
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        for (c in cookies) {
            store.removeAll { it.name == c.name && it.domain == c.domain }
            store.add(c)
        }
        prefs.edit().putStringSet("cookies", store.map { it.toString() }.toSet()).apply()
    }

    @Synchronized
    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val now = System.currentTimeMillis()
        return store.filter { it.expiresAt > now && it.matches(url) }
    }
}
