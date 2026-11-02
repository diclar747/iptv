package com.cinetv.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.cinetv.app.data.Card
import com.cinetv.app.data.LoginReq
import com.cinetv.app.data.MovieDetail
import com.cinetv.app.data.Net
import com.cinetv.app.data.Row
import com.cinetv.app.data.SerieDetail
import com.cinetv.app.data.User
import kotlinx.coroutines.launch

data class PlayTarget(val url: String, val mime: String, val title: String)

// Detalle abierto (ficha de película o serie).
sealed class Detail {
    data class Movie(val d: MovieDetail) : Detail()
    data class Serie(val d: SerieDetail) : Detail()
}

class AppViewModel : ViewModel() {
    var user by mutableStateOf<User?>(null)
        private set
    var booting by mutableStateOf(true)
        private set
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)

    var featured by mutableStateOf<List<Card>>(emptyList())
        private set
    var rows by mutableStateOf<List<Row>>(emptyList())
        private set

    var detail by mutableStateOf<Detail?>(null)
    var play by mutableStateOf<PlayTarget?>(null)

    private val api get() = Net.api

    fun boot() {
        viewModelScope.launch {
            try {
                user = api.me().user
                if (user != null) loadHome()
            } catch (_: Exception) { /* sin sesión */ }
            booting = false
        }
    }

    fun login(username: String, password: String) {
        viewModelScope.launch {
            busy = true; error = null
            try {
                user = api.login(LoginReq(username.trim(), password)).user
                if (user != null) loadHome()
            } catch (e: Exception) {
                error = humanize(e)
            }
            busy = false
        }
    }

    fun loginDemo() = login("demo", "demo")

    fun logout() {
        user = null; featured = emptyList(); rows = emptyList(); detail = null; play = null
    }

    private suspend fun loadHome() {
        val out = mutableListOf<Row>()
        try {
            val cat = api.catalogHome()
            featured = cat.featured ?: emptyList()
            cat.rows?.let { out.addAll(it) }
        } catch (_: Exception) {}
        try {
            val live = api.channelsHome()
            live.rows?.let { r -> out.addAll(r.map { it.copy(title = "📡 " + (it.title ?: "")) }) }
        } catch (_: Exception) {}
        rows = out
    }

    fun refreshHome() { viewModelScope.launch { loadHome() } }

    // Abrir una tarjeta: película/serie -> ficha; canal -> reproducir directo.
    fun openCard(card: Card) {
        viewModelScope.launch {
            busy = true; error = null
            try {
                when (card.kind) {
                    "movie" -> detail = Detail.Movie(api.movie(card.id.toLong()))
                    "serie" -> detail = Detail.Serie(api.serie(card.id.toLong()))
                    else -> {
                        val s = api.channelStreams(card.id).streams?.firstOrNull { !it.url.isNullOrBlank() }
                        if (s?.url != null) startPlay(s.url!!, card.displayTitle, s.userAgent, s.referrer)
                        else error = "Canal sin señal disponible"
                    }
                }
            } catch (e: Exception) {
                error = humanize(e)
            }
            busy = false
        }
    }

    fun playMovie(d: MovieDetail) {
        val s = d.streams?.firstOrNull { !it.url.isNullOrBlank() }
        val url = s?.url ?: d.streamUrl
        if (url != null) startPlay(url, d.title ?: "Película", s?.userAgent, s?.referrer)
    }

    fun playEpisodeUrl(url: String, title: String) = startPlay(url, title, null, null)

    private fun startPlay(rawUrl: String, title: String, ua: String?, ref: String?) {
        val proxied = Net.proxied(rawUrl, ua, ref)
        val mime = if (Net.isHls(rawUrl)) "application/x-mpegURL" else "video/mp4"
        play = PlayTarget(proxied, mime, title)
    }

    fun closePlayer() { play = null }
    fun closeDetail() { detail = null }

    private fun humanize(e: Exception): String =
        when {
            e.message?.contains("401") == true -> "Usuario o contraseña incorrectos"
            e.message?.contains("Unable to resolve host") == true -> "Sin conexión a internet"
            else -> e.message ?: "Error"
        }
}
