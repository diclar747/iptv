package com.cinetv.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.cinetv.app.data.Net
import com.cinetv.app.data.RadioStation
import com.cinetv.app.data.ReactReq
import com.cinetv.app.data.ReactionsResp
import kotlinx.coroutines.launch

@Composable
fun RadiosTab(vm: AppViewModel) {
    var stations by remember { mutableStateOf<List<RadioStation>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var search by remember { mutableStateOf("") }
    var retry by remember { mutableStateOf(0) }
    LaunchedEffect(retry) {
        loading = true; error = null
        try { stations = Net.api.radios().items }
        catch (e: Exception) { error = "No se pudieron cargar las radios. Revisá tu conexión e intentá nuevamente." }
        finally { loading = false }
    }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Radios de Paraguay", style = MaterialTheme.typography.headlineSmall)
        Text("Emisoras con transmisión por internet · Paraguay", style = MaterialTheme.typography.bodySmall)
        OutlinedTextField(search, { search = it }, label = { Text("Buscar radio o ciudad") }, modifier = Modifier.fillMaxWidth())
        if (loading) CircularProgressIndicator(Modifier.padding(16.dp))
        error?.let { Text(it); TextButton(onClick = { retry++ }) { Text("Reintentar") } }
        val filtered = stations.filter { "${it.name} ${it.city} ${it.tags}".contains(search, ignoreCase = true) }
        if (!loading && error == null) Text("${filtered.size} emisoras", Modifier.padding(vertical = 8.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(filtered, key = { it.id }) { station ->
                Card(Modifier.fillMaxWidth().clickable { vm.playRadio(station) }) {
                    Column(Modifier.padding(16.dp)) {
                        Text("▶  ${station.name}", style = MaterialTheme.typography.titleMedium)
                        Text(station.city.ifBlank { "Paraguay" }, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
fun VoteButtons(type: String, id: String) {
    var state by remember(type, id) { mutableStateOf(ReactionsResp()) }
    var busy by remember(type, id) { mutableStateOf(false) }
    var error by remember(type, id) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(type, id) {
        try { state = Net.api.reactions(type, id) }
        catch (_: Exception) { error = "No se pudieron cargar los votos" }
    }
    fun vote(value: Int) {
        busy = true; error = null
        scope.launch {
            try {
                val result = Net.api.toggleLike(ReactReq(type, id, value))
                state = state.copy(likes = result.likes, liked = result.liked, dislikes = result.dislikes, disliked = result.disliked)
            } catch (_: Exception) { error = "No se guardó el voto. Volvé a intentar." }
            finally { busy = false }
        }
    }
    Column {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(enabled = !busy, onClick = { vote(1) }) { Text("${if (state.liked) "✓ " else ""}Me gusta (${state.likes})") }
            TextButton(enabled = !busy, onClick = { vote(-1) }) { Text("${if (state.disliked) "✓ " else ""}No me gusta (${state.dislikes})") }
        }
        error?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
    }
}
