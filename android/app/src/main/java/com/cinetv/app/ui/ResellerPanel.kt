package com.cinetv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cinetv.app.data.ClientUser
import com.cinetv.app.data.CreateClientReq
import com.cinetv.app.data.CreateSubReq
import com.cinetv.app.data.AmountReq
import com.cinetv.app.data.CreditReqReq
import com.cinetv.app.data.CreditRequest
import com.cinetv.app.data.Net
import com.cinetv.app.data.PackageIdReq
import com.cinetv.app.data.Pkg
import com.cinetv.app.data.ResellerMe
import com.cinetv.app.data.StatusReq
import com.cinetv.app.data.SubReseller
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

private val Card = Color(0xFF14161C)
private fun gs(n: Number?): String = if (n == null) "—" else "₲" + NumberFormat.getInstance(Locale("es", "PY")).format(n)

private fun daysLeft(expiresAt: String?): String {
    if (expiresAt.isNullOrBlank()) return "∞"
    return try {
        val t = java.time.Instant.parse(expiresAt).toEpochMilli()
        val d = Math.ceil((t - System.currentTimeMillis()) / 86400000.0).toInt()
        if (d <= 0) "vencida" else "${d}d"
    } catch (_: Exception) { "—" }
}

// Panel distribuidor NATIVO: saldo, clientes (alta/renovar/habilitar),
// sub-vendedores (alta/vender saldo), solicitudes (pedir saldo + aprobar las
// recibidas). Mismas funciones que el panel web.
@Composable
fun ResellerPanelScreen(onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var tab by remember { mutableIntStateOf(0) }
    var me by remember { mutableStateOf<ResellerMe?>(null) }
    var clients by remember { mutableStateOf<List<ClientUser>>(emptyList()) }
    var packages by remember { mutableStateOf<List<Pkg>>(emptyList()) }
    var subs by remember { mutableStateOf<List<SubReseller>>(emptyList()) }
    var incoming by remember { mutableStateOf<List<CreditRequest>>(emptyList()) }
    var mine by remember { mutableStateOf<List<CreditRequest>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }

    var showCreateClient by remember { mutableStateOf(false) }
    var renewTarget by remember { mutableStateOf<ClientUser?>(null) }
    var showCreateSub by remember { mutableStateOf(false) }
    var sellTarget by remember { mutableStateOf<SubReseller?>(null) }
    var showAsk by remember { mutableStateOf(false) }

    fun reload() {
        scope.launch {
            try {
                me = Net.api.resellerMe()
                clients = Net.api.clients()
                packages = Net.api.packages()
                subs = Net.api.subresellers()
                incoming = Net.api.resellerCreditRequests()
                mine = Net.api.myCreditRequests()
                error = null
            } catch (e: Exception) { error = e.message }
        }
    }
    fun act(block: suspend () -> Unit) {
        scope.launch {
            try { block(); reload() } catch (e: Exception) { error = e.message }
        }
    }
    LaunchedEffect(Unit) { reload() }

    val myPending = mine.firstOrNull { it.kind == "credits" && it.status == "pending" }
    val incPending = incoming.count { it.status == "pending" }

    Box(Modifier.fillMaxSize().background(Bg)) {
        LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 24.dp)) {
            item {
                Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Panel distribuidor", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black)
                    Spacer(Modifier.weight(1f))
                    IconButton(onClick = onClose) { Icon(Icons.Filled.Close, "Cerrar", tint = Color.White) }
                }
            }
            item {
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatBox("Saldo", if (me?.unlimited == true) "∞" else (me?.credits?.toString() ?: "—"), Modifier.weight(1f), accent = true)
                    StatBox("Clientes", me?.clients?.toString() ?: "—", Modifier.weight(1f))
                    StatBox("Activos", me?.clientsActive?.toString() ?: "—", Modifier.weight(1f))
                }
            }
            item {
                Box(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
                    if (me?.unlimited == true) {
                        // admin: sin solicitar saldo
                    } else if (myPending != null) {
                        Text("Solicitud de ${myPending.amount} de saldo pendiente ⏳", color = Muted, fontSize = 13.sp)
                    } else {
                        Button(onClick = { showAsk = true }, colors = ButtonDefaults.buttonColors(containerColor = Red)) {
                            Text("+ Solicitar saldo", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            item {
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TabChip("Clientes", tab == 0) { tab = 0 }
                    TabChip("Sub-vendedores", tab == 1) { tab = 1 }
                    TabChip(if (incPending > 0) "Solicitudes ($incPending)" else "Solicitudes", tab == 2) { tab = 2 }
                }
            }
            error?.let { item { Text(it, color = Red, fontSize = 13.sp, modifier = Modifier.padding(16.dp)) } }

            when (tab) {
                0 -> {
                    item {
                        Button(onClick = { showCreateClient = true }, modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Card)) { Text("+ Nuevo cliente", color = Color.White) }
                    }
                    if (clients.isEmpty()) item { Empty("Sin clientes todavía.") }
                    items(clients) { c ->
                        RowCard {
                            Column(Modifier.weight(1f)) {
                                Text(c.username, color = Color.White, fontWeight = FontWeight.Bold)
                                Text("${c.packageName ?: "—"} · ${daysLeft(c.expiresAt)} · ${c.maxConnections ?: 1} pant.",
                                    color = Muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            TextButton(onClick = { renewTarget = c }) { Text("Renovar", color = Red) }
                            TextButton(onClick = {
                                act { Net.api.setClientStatus(c.id, StatusReq(if (c.status == "active") "disabled" else "active")) }
                            }) { Text(if (c.status == "active") "Off" else "On", color = Muted) }
                        }
                    }
                }
                1 -> {
                    item {
                        Button(onClick = { showCreateSub = true }, modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Card)) { Text("+ Nuevo sub-vendedor", color = Color.White) }
                    }
                    if (subs.isEmpty()) item { Empty("Sin sub-vendedores todavía.") }
                    items(subs) { s ->
                        RowCard {
                            Column(Modifier.weight(1f)) {
                                Text(s.username, color = Color.White, fontWeight = FontWeight.Bold)
                                Text("${s.credits} saldo · ${s.clientCount} clientes", color = Muted, fontSize = 12.sp)
                            }
                            TextButton(onClick = { sellTarget = s }) { Text("Vender saldo", color = Red) }
                        }
                    }
                }
                else -> {
                    item { SectionLabel("RECIBIDAS") }
                    if (incoming.isEmpty()) item { Empty("Sin solicitudes recibidas.") }
                    items(incoming) { r ->
                        RowCard {
                            Column(Modifier.weight(1f)) {
                                Text(r.requester ?: "—", color = Color.White, fontWeight = FontWeight.Bold)
                                Text("${if (r.kind == "upgrade") "Alta distribuidor" else "Saldo"} · ${r.amount} · ${statusLabel(r.status)}",
                                    color = Muted, fontSize = 12.sp)
                            }
                            if (r.status == "pending") {
                                TextButton(onClick = { act { Net.api.approveCreditRequest(r.id) } }) { Text("Aprobar", color = Red) }
                                TextButton(onClick = { act { Net.api.rejectCreditRequest(r.id) } }) { Text("No", color = Muted) }
                            }
                        }
                    }
                    item { SectionLabel("MIS SOLICITUDES") }
                    if (mine.isEmpty()) item { Empty("No enviaste solicitudes.") }
                    items(mine) { r ->
                        RowCard {
                            Column(Modifier.weight(1f)) {
                                Text(if (r.kind == "upgrade") "Alta distribuidor" else "Saldo", color = Color.White, fontWeight = FontWeight.Bold)
                                Text("${r.amount} · ${statusLabel(r.status)}", color = Muted, fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAsk) AmountDialog("Solicitar saldo", "Cantidad de saldo", "Enviar solicitud", { showAsk = false }) { amt ->
        showAsk = false; act { Net.api.createCreditRequest(CreditReqReq("credits", amt)) }
    }
    if (showCreateClient) CreateUserDialog("Nuevo cliente", packages, { showCreateClient = false }) { u, p, pkg ->
        showCreateClient = false; act { Net.api.createClient(CreateClientReq(u, p, pkg)) }
    }
    renewTarget?.let { c ->
        PackagePickerDialog("Renovar ${c.username}", packages, { renewTarget = null }) { pkg ->
            renewTarget = null; act { Net.api.renewClient(c.id, PackageIdReq(pkg)) }
        }
    }
    if (showCreateSub) CreateUserDialog("Nuevo sub-vendedor", null, { showCreateSub = false }) { u, p, credits ->
        showCreateSub = false; act { Net.api.createSubreseller(CreateSubReq(u, p, credits)) }
    }
    sellTarget?.let { s ->
        AmountDialog("Vender saldo a ${s.username}", "Saldo (negativo para recuperar)", "Vender", { sellTarget = null }) { amt ->
            sellTarget = null; act { Net.api.transferToSub(s.id, AmountReq(amt)) }
        }
    }
}

private fun statusLabel(s: String) = when (s) { "approved" -> "aprobada"; "rejected" -> "rechazada"; else -> "pendiente" }

@Composable
private fun StatBox(label: String, value: String, modifier: Modifier = Modifier, accent: Boolean = false) {
    Column(modifier.clip(RoundedCornerShape(12.dp)).background(Card).padding(vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = if (accent) Red else Color.White, fontSize = 22.sp, fontWeight = FontWeight.Black)
        Text(label, color = Muted, fontSize = 11.sp)
    }
}

@Composable
private fun TabChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.clip(RoundedCornerShape(20.dp)).background(if (selected) Red else Card).clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 8.dp)
    ) { Text(label, color = if (selected) Color.White else Muted, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
}

@Composable
private fun RowCard(content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)
            .clip(RoundedCornerShape(10.dp)).background(Card).padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically, content = content
    )
}

@Composable
private fun SectionLabel(text: String) {
    Text(text, color = Muted, fontSize = 11.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(start = 16.dp, top = 14.dp, bottom = 4.dp))
}

@Composable
private fun Empty(text: String) {
    Text(text, color = Muted, fontSize = 13.sp, modifier = Modifier.padding(16.dp))
}

// Diálogo para pedir un monto (saldo).
@Composable
private fun AmountDialog(title: String, label: String, confirm: String, onDismiss: () -> Unit, onConfirm: (Int) -> Unit) {
    var v by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = Surface,
        title = { Text(title, color = Color.White) },
        text = {
            OutlinedTextField(v, { v = it.filter { ch -> ch.isDigit() || ch == '-' } }, label = { Text(label) },
                singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
        },
        confirmButton = {
            TextButton(onClick = { v.toIntOrNull()?.let { if (it != 0) onConfirm(it) } }) { Text(confirm, color = Red, fontWeight = FontWeight.Bold) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar", color = Muted) } }
    )
}

// Diálogo para crear usuario (cliente o sub-vendedor). Con paquetes -> cliente
// (elige paquete); sin paquetes -> sub-vendedor (ingresa saldo inicial).
@Composable
private fun CreateUserDialog(title: String, packages: List<Pkg>?, onDismiss: () -> Unit, onConfirm: (String, String, Int) -> Unit) {
    var u by remember { mutableStateOf("") }
    var p by remember { mutableStateOf("") }
    var pkgId by remember { mutableStateOf(packages?.firstOrNull()?.id ?: "") }
    var credits by remember { mutableStateOf("0") }
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = Surface,
        title = { Text(title, color = Color.White) },
        text = {
            Column {
                OutlinedTextField(u, { u = it }, label = { Text("Usuario") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(p, { p = it }, label = { Text("Contraseña") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                    visualTransformation = PasswordVisualTransformation())
                Spacer(Modifier.height(8.dp))
                if (packages != null) {
                    PackageDropdown(packages, pkgId) { pkgId = it }
                } else {
                    OutlinedTextField(credits, { credits = it.filter { ch -> ch.isDigit() } }, label = { Text("Saldo inicial") },
                        singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                if (u.isNotBlank() && p.isNotBlank()) {
                    val extra = if (packages != null) (pkgId.toIntOrNull() ?: 0) else (credits.toIntOrNull() ?: 0)
                    if (packages == null || extra != 0) onConfirm(u.trim(), p, extra)
                }
            }) { Text("Crear", color = Red, fontWeight = FontWeight.Bold) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar", color = Muted) } }
    )
}

// Diálogo para elegir un paquete (renovación).
@Composable
private fun PackagePickerDialog(title: String, packages: List<Pkg>, onDismiss: () -> Unit, onConfirm: (Int) -> Unit) {
    var pkgId by remember { mutableStateOf(packages.firstOrNull()?.id ?: "") }
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = Surface,
        title = { Text(title, color = Color.White) },
        text = { PackageDropdown(packages, pkgId) { pkgId = it } },
        confirmButton = {
            TextButton(onClick = { pkgId.toIntOrNull()?.let(onConfirm) }) { Text("Confirmar", color = Red, fontWeight = FontWeight.Bold) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar", color = Muted) } }
    )
}

@Composable
private fun PackageDropdown(packages: List<Pkg>, selected: String, onSelect: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val sel = packages.firstOrNull { it.id == selected }
    Box {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) {
            Text(sel?.let { "${it.name} · ${it.credits} saldo" } ?: "Elegí paquete", color = Color.White)
        }
        DropdownMenu(open, onDismissRequest = { open = false }, modifier = Modifier.background(Surface)) {
            packages.forEach { p ->
                DropdownMenuItem(
                    text = { Text("${p.name} · ${p.credits} saldo · ${p.durationDays}d", color = Color.White) },
                    onClick = { onSelect(p.id); open = false }
                )
            }
        }
    }
}
