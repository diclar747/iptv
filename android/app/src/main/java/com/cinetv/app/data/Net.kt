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

// Red compartida: el MISMO OkHttpClient (con la cookie de sesión) lo usan Retrofit
// y el reproductor (ExoPlayer), así los streams proxied pasan autenticados.
object Net {
    const val BASE = "https://live.cd.com.py/"

    lateinit var okHttp: OkHttpClient
        private set
    lateinit var api: Api
        private set

    fun init(ctx: Context) {
        if (::okHttp.isInitialized) return
        okHttp = OkHttpClient.Builder()
            .cookieJar(PrefsCookieJar(ctx.applicationContext))
            .build()
        api = Retrofit.Builder()
            .baseUrl(BASE)
            .client(okHttp)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(Api::class.java)
    }

    // URL de reproducción por el proxy (resuelve cabeceras y auth de sesión).
    fun proxied(rawUrl: String, ua: String? = null, ref: String? = null): String {
        val sb = StringBuilder(BASE).append("api/stream?url=").append(enc(rawUrl))
        if (!ua.isNullOrBlank()) sb.append("&ua=").append(enc(ua))
        if (!ref.isNullOrBlank()) sb.append("&ref=").append(enc(ref))
        return sb.toString()
    }

    fun isHls(rawUrl: String?): Boolean = rawUrl?.contains(".m3u8", true) == true

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
}

// CookieJar mínimo que persiste la sesión entre reinicios de la app.
private class PrefsCookieJar(ctx: Context) : CookieJar {
    private val prefs = ctx.getSharedPreferences("cinetv_cookies", Context.MODE_PRIVATE)
    private val store = mutableListOf<Cookie>()

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
