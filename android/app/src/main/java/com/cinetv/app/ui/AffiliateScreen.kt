package com.cinetv.app.ui

import android.content.Intent
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.webkit.ValueCallback
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import java.io.File
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.cinetv.app.data.Net
import okhttp3.HttpUrl.Companion.toHttpUrl

// Web and Android share the same authenticated wallet and payment workflow.
@Composable
fun AffiliateScreen(onClose: () -> Unit) {
    val context = LocalContext.current
    var view by remember { mutableStateOf<WebView?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var fileCallback by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        fileCallback?.onReceiveValue(if(ok) cameraUri?.let{arrayOf(it)} else null);fileCallback=null
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        fileCallback?.onReceiveValue(uri?.let { arrayOf(it) }); fileCallback = null
    }
    BackHandler { if (view?.canGoBack() == true) view?.goBack() else onClose() }
    DisposableEffect(Unit) {
        onDispose { fileCallback?.onReceiveValue(null);fileCallback=null;view?.stopLoading(); view?.destroy(); view = null }
    }
    Column(Modifier.fillMaxSize().background(Color(0xFF080E17))) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Afiliados y billetera", color = Color.White, modifier = Modifier.weight(1f))
            IconButton(onClick = onClose) { Icon(Icons.Default.Close, "Cerrar", tint = Color.White) }
        }
        error?.let { Text(it, color = Color(0xFFFF93A4), modifier = Modifier.padding(20.dp)) }
        AndroidView(modifier = Modifier.weight(1f).fillMaxWidth(), factory = { ctx ->
            WebView(ctx).apply {
                view = this
                setBackgroundColor(android.graphics.Color.rgb(8, 14, 23))
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                webChromeClient = object : WebChromeClient() {
                    override fun onShowFileChooser(v: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                        fileCallback?.onReceiveValue(null);fileCallback=callback
                        if(params.isCaptureEnabled){
                            runCatching {
                                val dir=File(context.cacheDir,"receipts").apply{mkdirs()}
                                dir.listFiles()?.filter{it.lastModified()<System.currentTimeMillis()-86400000}?.forEach{it.delete()}
                                val uri=FileProvider.getUriForFile(context,context.packageName+".receipts",File.createTempFile("receipt-",".jpg",dir));cameraUri=uri;camera.launch(uri)
                            }.onFailure{picker.launch("image/*")}
                        }else picker.launch("image/*")
                        return true
                    }
                }
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
                        val uri = request.url
                        if (uri.scheme == "https" && uri.host == Uri.parse(Net.BASE).host) return false
                        if (uri.scheme in listOf("https", "http")) runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                        return true
                    }
                }
                val session = Net.okHttp.cookieJar.loadForRequest(Net.BASE.toHttpUrl()).find { it.name == "sid" }
                if (session == null) error = "Volvé a iniciar sesión para abrir tu billetera."
                else {
                    val cookies = CookieManager.getInstance()
                    cookies.setAcceptCookie(true)
                    cookies.setCookie(Net.BASE, session.toString()) { if(view === this) loadUrl(Net.BASE + "afiliados") }
                }
            }
        })
    }
}
