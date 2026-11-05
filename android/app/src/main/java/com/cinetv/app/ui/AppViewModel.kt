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

data class PlayTarget(
    val url: String, val mime: String, val title: String,
    // Datos crudos para generar la URL firmada de cast (proyección a TV).
    val rawUrl: String, val ua: String? = null, val ref: String? = null,
    // En vivo (canal): reintentar/reanudar indefinidamente. Película: no.
    val isLive: Boolean = false,
    val reactionType: String = "channel", val reactionId: String = "",
    val isAudio: Boolean = false, val subtitle: String = "",
)

// Detalle abierto (ficha de película o serie).
sealed class Detail {
    data class Movie(val d: MovieDetail) : Detail()
    data class Serie(val d: SerieDetail) : Detail()
    data class Channel(val c: Card) : Detail()
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
    // Filas de CANALES (inicio) y de PELÍCULAS (pestaña Pelis), separadas: el
    // inicio prioriza los canales en vivo.
    var channelRows by mutableStateOf<List<Row>>(emptyList())
        private set
    var movieRows by mutableStateOf<List<Row>>(emptyList())
        private set
    var meta by mutableStateOf<com.cinetv.app.data.Meta?>(null)
        private set
    // País detectado por IP (para abrir En Vivo en el país del usuario).
    var geoCountry by mutableStateOf("PY")
        private set

    var detail by mutableStateOf<Detail?>(null)
    private var radioJob: kotlinx.coroutines.Job? = null
    private var radioGeneration = 0
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
        user = null; featured = emptyList(); channelRows = emptyList(); movieRows = emptyList(); detail = null; play = null
    }

    private suspend fun loadHome() {
        var err: String? = null
        // Canales primero (prioridad del inicio).
        try {
            val live = api.channelsHome()
            channelRows = live.rows ?: emptyList()
        } catch (e: Exception) { err = "Canales: " + humanize(e) }
        // Películas: para la pestaña Pelis (banner + filas).
        try {
            val cat = api.catalogHome()
            featured = cat.featured ?: emptyList()
            movieRows = cat.rows ?: emptyList()
        } catch (e: Exception) { if (err == null) err = "Pelis: " + humanize(e) }
        try { meta = api.meta() } catch (_: Exception) { /* opcional */ }
        try { api.geo().country?.let { geoCountry = it } } catch (_: Exception) { /* queda PY */ }
        // Si algo falló, lo mostramos (antes quedaba girando el spinner para
        // siempre, sin indicio de la causa).
        error = err
    }

    suspend fun refreshSignalStates() {
        try {
            val ids=channelRows.flatMap { it.items.orEmpty() }.map { it.id }.distinct().take(20)
            if(ids.isEmpty())return
            val states=api.channelStatuses(ids.joinToString(",")).associateBy { it.id }
            channelRows=channelRows.map { row -> row.copy(items=row.items?.filter { states[it.id]?.status !in listOf("blocked","deleted") }?.map { c -> states[c.id]?.let { c.copy(status=it.status,checkedAt=it.checkedAt) } ?: c }) }
        } catch(e: kotlinx.coroutines.CancellationException) {throw e} catch(_:Exception) { }
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
                    else -> detail = Detail.Channel(card) // ficha de canal (Ver en vivo + acciones)
                }
            } catch (e: Exception) {
                error = humanize(e)
            }
            busy = false
        }
    }

    // Reproduce un canal en vivo: busca su primera señal con URL y la lanza.
    fun playChannel(card: Card) {
        radioGeneration++;radioJob?.cancel()
        viewModelScope.launch {
            busy = true; error = null
            try {
                val s = api.channelStreams(card.id).streams?.firstOrNull { !it.url.isNullOrBlank() }
                if (s?.url != null) startPlay(s.url!!, card.displayTitle, s.userAgent, s.referrer, isLive = true, reactionType = "channel", reactionId = card.id)
                else error = "Canal sin señal disponible"
            } catch (e: Exception) {
                error = humanize(e)
            }
            busy = false
        }
    }

    fun playMovie(d: MovieDetail) {
        val s = d.streams?.firstOrNull { !it.url.isNullOrBlank() }
        val url = s?.url ?: d.streamUrl
        if (url != null) startPlay(url, d.title ?: "Película", s?.userAgent, s?.referrer, isLive = false, reactionType = "movie", reactionId = d.id.toString())
    }

    fun playEpisodeUrl(url: String, title: String) = startPlay(url, title, null, null, isLive = false)

    fun addFavorite(kind: String, id: Long) {
        viewModelScope.launch {
            try { api.addFavorite(com.cinetv.app.data.FavReq(if (kind == "serie") "serie" else "movie", id)) } catch (_: Exception) { /* ignore */ }
        }
    }

    private fun startPlay(rawUrl: String, title: String, ua: String?, ref: String?, isLive: Boolean, reactionType: String = "series", reactionId: String = (detail as? Detail.Serie)?.d?.id?.toString() ?: "") {
        val proxied = Net.proxied(rawUrl, ua, ref)
        val mime = if (Net.isHls(rawUrl)) "application/x-mpegURL" else "video/mp4"
        play = PlayTarget(proxied, mime, title, rawUrl, ua, ref, isLive, reactionType, reactionId)
    }

    fun playRadio(station: com.cinetv.app.data.RadioStation) {
        val generation=++radioGeneration;radioJob?.cancel();busy=true;error=null
        radioJob=viewModelScope.launch {
            try{
                val ready=Net.playbackApi.radioPlayback(station.id)
                if(generation!=radioGeneration)return@launch
                val mime=if(Net.isHls(ready.url)||ready.codec.equals("HLS",true))"application/x-mpegURL" else if(ready.codec.contains("AAC",true))"audio/aac" else if(ready.codec.contains("OGG",true))"audio/ogg" else "audio/mpeg"
                play=PlayTarget(Net.proxied(ready.url,ref=ready.source),mime,ready.name,ready.url,ref=ready.source,isLive=true,reactionType="radio",reactionId=ready.id,isAudio=true,subtitle=ready.city.ifBlank{"Paraguay · Transmisión en directo"})
            }catch(e:kotlinx.coroutines.CancellationException){throw e}
            catch(_:Exception){if(generation==radioGeneration)error="No pudimos conectar con la radio. Volvé a intentar en unos segundos."}
            finally{if(generation==radioGeneration)busy=false}
        }
    }

    fun closePlayer() { radioGeneration++; radioJob?.cancel();busy=false;play = null }
    fun closeDetail() { detail = null }

    private fun humanize(e: Exception): String =
        when {
            e.message?.contains("401") == true -> "Usuario o contraseña incorrectos"
            e.message?.contains("Unable to resolve host") == true -> "Sin conexión a internet"
            else -> e.message ?: "Error"
        }
}
