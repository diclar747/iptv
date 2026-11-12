package com.cinetv.app.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationManagerCompat
import com.cinetv.app.AppSettings
import com.cinetv.app.data.Net
import com.cinetv.app.data.NotificationPreference
import kotlinx.coroutines.launch

@Composable
fun AppSettingsScreen(){
 val context=LocalContext.current
 val scope=rememberCoroutineScope()
 val foreground=rememberForeground()
 var background by remember{mutableStateOf(AppSettings.background)}
 var screen by remember{mutableStateOf(AppSettings.keepScreenOn)}
 var enabled by remember{mutableStateOf(AppSettings.notifications)}
 var busy by remember{mutableStateOf(false)}
 var permission by remember{mutableStateOf(NotificationManagerCompat.from(context).areNotificationsEnabled())}
 var unrestricted by remember{mutableStateOf(false)}
 var message by remember{mutableStateOf<String?>(null)}
 val launcher=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){permission=NotificationManagerCompat.from(context).areNotificationsEnabled()}
 fun system(intent:Intent){runCatching{context.startActivity(intent)}.onFailure{message="No pudimos abrir ese ajuste. Buscá LiveTV en los ajustes de tu teléfono."}}
 LaunchedEffect(foreground){if(foreground){permission=NotificationManagerCompat.from(context).areNotificationsEnabled();unrestricted=context.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(context.packageName);try{enabled=Net.api.notifications().enabled;AppSettings.notifications=enabled}catch(e:kotlinx.coroutines.CancellationException){throw e}catch(_:Exception){message="No pudimos actualizar la preferencia de avisos. Revisá tu conexión."}}}
 fun notices(value:Boolean){if(busy)return;busy=true;scope.launch{try{Net.api.notificationSettings(NotificationPreference(value));enabled=value;AppSettings.notifications=value;if(value&&Build.VERSION.SDK_INT>=33&&context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)launcher.launch(Manifest.permission.POST_NOTIFICATIONS)}catch(e:kotlinx.coroutines.CancellationException){throw e}catch(_:Exception){message="No pudimos guardar la preferencia."}finally{busy=false}}}
 LazyColumn(Modifier.fillMaxSize().background(Bg),contentPadding=PaddingValues(18.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
  item{Text("Configuración",color=Color.White,fontSize=25.sp,fontWeight=FontWeight.Bold);Text("LiveTV a tu manera, en este dispositivo.",color=Muted,modifier=Modifier.padding(top=8.dp))}
  message?.let{item{Text(it,color=Color(0xFFFFC87F))}}
  item{SettingsGroup("Notificaciones"){
   SettingsSwitch("Recibir avisos de mi cuenta","Novedades, pagos y movimientos. Se comparte con la web.",enabled,!busy){notices(it)}
   Text(if(permission)"Permiso de Android: permitido" else "Permiso de Android: desactivado",color=if(permission)StudioAccent else Color(0xFFFFC87F),fontSize=13.sp)
   TextButton(onClick={system(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,context.packageName))}){Text("Permisos y sonido de notificaciones",color=StudioAccent)}
   Text("Los avisos en segundo plano se consultan periódicamente. Android decide cuándo ejecutar la actualización.",color=Muted,fontSize=12.sp)
  }}
  item{SettingsGroup("Reproducción"){
   SettingsSwitch("Continuar al minimizar","Mantiene el audio de la radio o canal con la pantalla bloqueada. La notificación permite pausar la reproducción.",background){background=it;AppSettings.background=it}
   SettingsSwitch("Pantalla encendida al mirar video","Evita que se apague mientras mirás un canal. La radio puede sonar con la pantalla apagada.",screen){screen=it;AppSettings.keepScreenOn=it}
   Text("Cerrar el reproductor detiene la reproducción.",color=Muted,fontSize=12.sp)
  }}
  item{SettingsGroup("Batería y segundo plano"){
   Text(if(unrestricted)"Batería sin optimización para LiveTV" else "Android está administrando la batería de LiveTV",color=if(unrestricted)StudioAccent else Color.White,fontWeight=FontWeight.SemiBold)
   Text("Si el teléfono interrumpe el audio, abrí sus ajustes de batería y permití el uso sin restricciones para LiveTV. Esto puede consumir más batería.",color=Muted,fontSize=13.sp)
   OutlinedButton(onClick={system(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))},modifier=Modifier.fillMaxWidth()){Text("Abrir ajustes de batería",color=StudioAccent)}
   TextButton(onClick={system(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,android.net.Uri.parse("package:"+context.packageName)))}){Text("Información de LiveTV y permisos",color=StudioAccent)}
  }}
  item{Text("LiveTV 1.33 · Web y Android comparten tu cuenta y favoritos.",color=Muted,fontSize=12.sp)}
 }
}
@Composable private fun SettingsGroup(title:String,content:@Composable ColumnScope.()->Unit){Column(Modifier.fillMaxWidth().background(StudioSurface,androidx.compose.foundation.shape.RoundedCornerShape(18.dp)).padding(18.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){Text(title,color=Color.White,fontSize=18.sp,fontWeight=FontWeight.Bold);content()}}
@Composable private fun SettingsSwitch(title:String,description:String,value:Boolean,enabled:Boolean=true,onChange:(Boolean)->Unit){Row(Modifier.fillMaxWidth().padding(vertical=6.dp),verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f).padding(end=12.dp)){Text(title,color=Color.White,fontWeight=FontWeight.SemiBold);Text(description,color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=6.dp))};Switch(checked=value,onCheckedChange=onChange,enabled=enabled)}}
