package com.cinetv.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import com.cinetv.app.data.Card
import com.cinetv.app.data.MovieCategory

@Composable
fun MovieBrowseHeader(feature: Card?, categories: List<MovieCategory>, query: String, category: String?, onQuery: (String) -> Unit, onCategory: (String?) -> Unit, onOpen: (Card) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val keyboard = LocalSoftwareKeyboardController.current
    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(25.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF14383D),Color(0xFF152438),Color(0xFF111B2A))))
            .border(1.dp,Color(0xFF29454F),RoundedCornerShape(25.dp)).padding(20.dp),verticalArrangement = Arrangement.spacedBy(15.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically,horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(StudioAccent.copy(alpha=.12f)),contentAlignment=Alignment.Center) {
                    Icon(Icons.Default.Movie,null,tint=StudioAccent,modifier=Modifier.size(25.dp))
                }
                Column(verticalArrangement=Arrangement.spacedBy(3.dp)) {
                    Text("TU SALA DE CINE",fontSize=9.sp,letterSpacing=2.sp,color=StudioAccent,fontWeight=FontWeight.Bold)
                    Text("Películas",fontSize=29.sp,lineHeight=33.sp,color=Color.White,fontWeight=FontWeight.Bold,letterSpacing=(-.7).sp)
                }
            }
            Text("Encontrá una historia para disfrutar hoy.",color=Color(0xFFB5C8D4),fontSize=12.sp)
            OutlinedTextField(value=query,onValueChange={onQuery(it.take(160))},modifier=Modifier.fillMaxWidth(),singleLine=true,
                keyboardOptions=KeyboardOptions(imeAction=ImeAction.Search),keyboardActions=KeyboardActions(onSearch={keyboard?.hide()}),
                placeholder={Text("Buscar por título…",fontSize=14.sp)},leadingIcon={Icon(Icons.Default.Search,null,tint=StudioAccent)},
                trailingIcon={if(query.isNotEmpty())IconButton(onClick={onQuery("")}){Icon(Icons.Default.Close,"Borrar búsqueda")}},
                shape=RoundedCornerShape(16.dp),colors=OutlinedTextFieldDefaults.colors(focusedBorderColor=StudioAccent,unfocusedBorderColor=Color(0xFF365260),focusedContainerColor=Color(0xFF0D1A27),unfocusedContainerColor=Color(0xFF0D1A27)))
            Box(Modifier.fillMaxWidth()) {
                OutlinedButton(onClick={keyboard?.hide();expanded=true},modifier=Modifier.fillMaxWidth().heightIn(min=48.dp),shape=RoundedCornerShape(15.dp),contentPadding=PaddingValues(horizontal=14.dp,vertical=10.dp)) {
                    Icon(Icons.Default.Tune,null,modifier=Modifier.size(19.dp),tint=StudioAccent)
                    Text(categories.find{it.value==category}?.let{it.label?:it.value}?:"Todas las categorías",modifier=Modifier.weight(1f).padding(horizontal=10.dp),textAlign=androidx.compose.ui.text.style.TextAlign.Start,color=Color.White,fontSize=13.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                    Icon(Icons.Default.KeyboardArrowDown,"Elegir categoría",tint=Color(0xFFA8BECD))
                }
                DropdownMenu(expanded=expanded,onDismissRequest={expanded=false},modifier=Modifier.heightIn(max=320.dp).widthIn(min=240.dp)) {
                    DropdownMenuItem(text={Text("Todas las categorías")},onClick={onCategory(null);expanded=false})
                    categories.forEach { c -> DropdownMenuItem(text={Text(c.label?:c.value)},onClick={onCategory(c.value);expanded=false},trailingIcon={if(category==c.value)Icon(Icons.Default.Check,null,tint=StudioAccent)}) }
                }
            }
        }
        if(feature!=null&&query.isBlank()&&category==null) {
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(StudioSurface).border(1.dp,Color(0xFF263847),RoundedCornerShape(20.dp)).padding(12.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(14.dp)) {
                SubcomposeAsyncImage(feature.image,null,contentScale=ContentScale.Crop,modifier=Modifier.width(76.dp).height(100.dp).clip(RoundedCornerShape(12.dp)),error={Box(Modifier.fillMaxSize().background(Color(0xFF1B3040)),contentAlignment=Alignment.Center){Icon(Icons.Default.Movie,null,tint=StudioAccent)}})
                Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                    Text("PARA VER HOY",fontSize=8.sp,letterSpacing=1.8.sp,color=StudioAccent,fontWeight=FontWeight.Bold)
                    Text(feature.displayTitle,color=Color.White,fontSize=15.sp,lineHeight=20.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis)
                    Text(listOfNotNull(feature.year?.toString(),feature.category).joinToString(" · "),color=Muted,fontSize=10.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                }
                FilledIconButton(onClick={keyboard?.hide();onOpen(feature)},modifier=Modifier.size(44.dp),colors=IconButtonDefaults.filledIconButtonColors(containerColor=StudioAccent,contentColor=Color(0xFF062921))){Icon(Icons.Default.PlayArrow,"Ver película")}
            }
        }
        Row(Modifier.fillMaxWidth().padding(vertical=2.dp),verticalAlignment=Alignment.CenterVertically) {
            Text(if(query.isNotBlank())"Resultados de búsqueda" else category?:"Explorá la cartelera",color=Color.White,fontSize=17.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f))
            if(query.isNotEmpty()||category!=null)TextButton(onClick={onQuery("");onCategory(null)}){Text("Limpiar",color=StudioAccent,fontSize=12.sp)}
        }
    }
}
