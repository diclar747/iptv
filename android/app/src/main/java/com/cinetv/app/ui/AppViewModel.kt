package com.cinetv.app.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.cinetv.app.data.Card
import com.cinetv.app.data.LoginReq
import com.cinetv.app.data.GoogleLoginProof
import com.cinetv.app.data.MovieDetail
import com.cinetv.app.data.Net
import com.cinetv.app.data.Row
import com.cinetv.app.data.SerieDetail
import com.cinetv.app.data.User
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import java.security.MessageDigest
import java.security.SecureRandom

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
    var channelFavorites by mutableStateOf<List<Card>>(emptyList())
        private set
    var favoritesBusy by mutableStateOf(false)
        private set
    var favoritesLoading by mutableStateOf(false)
        private set
    suspend fun refreshChannelFavorites() {
        val owner=user?.id?:return
        favoritesLoading=true
        try { val result=api.channelFavorites();if(user?.id==owner)channelFavorites=result }
        catch(e:kotlinx.coroutines.CancellationException){throw e}
        catch(_:Exception){if(user?.id==owner)error="No pudimos actualizar tus canales favoritos. Revisá tu conexión."}
        finally{favoritesLoading=false}
    }
    fun toggleChannelFavorite(card:Card) {
        if(favoritesBusy||favoritesLoading)return
        val owner=user?.id?:return
        favoritesBusy=true
        viewModelScope.launch {
            try {
                if(channelFavorites.any{it.id==card.id}){api.removeChannelFavorite(card.id);if(user?.id==owner)channelFavorites=channelFavorites.filterNot{it.id==card.id}}
                else{api.addChannelFavorite(card.id);if(user?.id==owner)channelFavorites=channelFavorites+card}
            }catch(e:kotlinx.coroutines.CancellationException){throw e}
            catch(_:Exception){if(user?.id==owner)error="No pudimos guardar el favorito. Volvé a intentar."}
            finally{favoritesBusy=false}
        }
    }

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
    private var accessExpiryJob: kotlinx.coroutines.Job? = null
    private fun scheduleAccessExpiry(){
        accessExpiryJob?.cancel()
        val deadline=user?.takeIf{it.role!="admin"}?.expiresAt?.let{runCatching{java.time.Instant.parse(it).toEpochMilli()}.getOrNull()}?:return
        val accountId=user?.id ?: return
        accessExpiryJob=viewModelScope.launch {
            delay((deadline-System.currentTimeMillis()).coerceAtLeast(0))
            while(user?.id==accountId){
                val updated=try { api.me().user } catch(e:CancellationException){throw e} catch(_:Exception){null}
                if(user?.id!=accountId)break
                val nextDeadline=updated?.expiresAt?.let{runCatching{java.time.Instant.parse(it).toEpochMilli()}.getOrNull()}
                if(updated?.id==accountId&&nextDeadline!=null&&nextDeadline>System.currentTimeMillis()){
                    val wasExpired=user?.subscription?.active==false
                    user=updated
                    com.cinetv.app.PlaybackHolder.deadline=nextDeadline
                    if(wasExpired)loadHome()
                    scheduleAccessExpiry()
                    break
                }
                closePlayer()
                delay(30000)
            }
        }
    }
    private var radioJob: kotlinx.coroutines.Job? = null
    private var radioGeneration = 0
    var play by mutableStateOf<PlayTarget?>(null)

    private val api get() = Net.api
    var googleEnabled by mutableStateOf(false)
        private set
    var googlePending by mutableStateOf(false)
        private set
    private var googleJob: Job? = null

    suspend fun loadGoogleStatus() {
        try { googleEnabled = api.googleLoginStatus().enabled }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { googleEnabled = false }
    }

    fun cancelGoogleLogin() { googleJob?.cancel() }

    fun loginWithGoogle(context: Context) {
        if (busy || googlePending || !googleEnabled) return
        val flags = Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP
        val verifier = Base64.encodeToString(ByteArray(32).also { SecureRandom().nextBytes(it) }, flags)
        val challenge = Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()), flags)
        val url = Uri.parse(Net.BASE + "api/auth/google/start").buildUpon()
            .appendQueryParameter("mobile_challenge", challenge).build()
        googleJob = viewModelScope.launch {
            googlePending = true
            error = null
            try {
                context.startActivity(Intent(Intent.ACTION_VIEW, url))
                repeat(150) {
                    delay(4000)
                    val signedIn = try { api.finishGoogleLogin(GoogleLoginProof(verifier)).user }
                    catch (_: java.io.IOException) { null }
                    if (signedIn != null) {
                        user = signedIn
                        scheduleAccessExpiry()
                        loadHome()
                        return@launch
                    }
                }
                error = "El ingreso con Google venció. Volvé a intentarlo."
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { error = "No pudimos completar el ingreso con Google." }
            finally { googlePending = false }
        }
    }

    fun boot() {
        viewModelScope.launch {
            try{user=api.me().user}catch(e:kotlinx.coroutines.CancellationException){throw e}catch(_:Exception){}finally{booting=false}
            if(user!=null){if(play==null)play=com.cinetv.app.PlaybackHolder.target;scheduleAccessExpiry();busy=true;try{loadHome()}finally{busy=false}}
        }
    }

    fun login(username: String, password: String) {
        viewModelScope.launch {
            busy = true; error = null
            try {
                user = api.login(LoginReq(username.trim(), password)).user
                if (user != null) { scheduleAccessExpiry(); loadHome() }
            } catch (e: Exception) {
                error = humanize(e)
            }
            busy = false
        }
    }

    fun register(username: String,password: String){
        viewModelScope.launch {
            busy=true;error=null
            try{user=api.register(LoginReq(username.trim(),password)).user;if(user!=null){scheduleAccessExpiry();loadHome()}}
            catch(e:kotlinx.coroutines.CancellationException){throw e}
            catch(e:retrofit2.HttpException){error=when(e.code()){409->"Ese usuario ya existe. Elegí otro o iniciá sesión.";400->"Revisá el usuario y la contraseña (mínimo 8 caracteres).";else->"No pudimos crear tu cuenta. Volvé a intentar."}}
            catch(_:Exception){error="No pudimos conectar. Revisá tu conexión e intentá nuevamente."}
            finally{busy=false}
        }
    }

    fun logout() {
        channelFavorites=emptyList()
        Net.logout()
        accessExpiryJob?.cancel();closePlayer()
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
        refreshChannelFavorites()
        try{com.cinetv.app.AppSettings.notifications=api.notifications().enabled}catch(e:kotlinx.coroutines.CancellationException){throw e}catch(_:Exception){}
    }

    suspend fun refreshSignalStates(ids: List<String>) {
        try {
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
        com.cinetv.app.PlaybackHolder.deadline=if(user?.role=="admin")Long.MAX_VALUE else user?.expiresAt?.let{runCatching{java.time.Instant.parse(it).toEpochMilli()}.getOrNull()}?:Long.MAX_VALUE
        val proxied = Net.proxied(rawUrl, ua, ref)
        val path = rawUrl.substringBefore('?')
        val mime = when {
            Net.isHls(rawUrl) -> "application/x-mpegURL"
            path.endsWith(".webm", ignoreCase = true) -> "video/webm"
            path.endsWith(".mkv", ignoreCase = true) -> "video/x-matroska"
            else -> "video/mp4"
        }
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

    fun closePlayer() { com.cinetv.app.PlaybackService.stop(); radioGeneration++; radioJob?.cancel();busy=false;play = null }
    fun closeDetail() { detail = null }

    private fun humanize(e: Exception): String =
        when {
            e.message?.contains("401") == true -> "Usuario o contraseña incorrectos"
            e.message?.contains("Unable to resolve host") == true -> "Sin conexión a internet"
            else -> e.message ?: "Error"
        }
}
