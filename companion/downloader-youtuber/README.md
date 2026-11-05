# Downloader YouTuber

Aplicación local para Windows. Abrí **Iniciar.cmd** y entrá a http://127.0.0.1:4318. Requiere Node.js 22 o superior.

Pegá un enlace de YouTube, elegí 720p, 1080p, 1440p, 4K, máxima calidad o MP3 y seleccioná una carpeta con **Cambiar**. Podés agregar varios videos a la cola y cancelar descargas. El selector de calidad es un límite: si el original tiene menor resolución, se descarga esa resolución. Máxima calidad permite resoluciones superiores a 4K. Los videos se guardan en MKV para conservar los códecs originales sin pérdida; audio y video se unen con FFmpeg. No se amplía artificialmente la resolución.

El servidor escucha únicamente en este equipo. Cerrá la ventana de consola para detenerlo. La carpeta elegida se recuerda; la lista de descargas es de la sesión actual. Los archivos parciales permiten reanudar al agregar nuevamente el mismo enlace y destino.

Si faltan motores o YouTube cambia, ejecutá `powershell -ExecutionPolicy Bypass -File Preparar.ps1` desde esta carpeta para instalar/actualizar yt-dlp. FFmpeg se instala cuando falta. Fuentes oficiales: https://github.com/yt-dlp/yt-dlp y https://www.gyan.dev/ffmpeg/builds/.

YouTube puede limitar el acceso desde ciertas conexiones, exigir inicio de sesión o restringir videos. La aplicación muestra el error real del motor; no elimina restricciones de acceso. Usá contenido propio o autorizado.

## Descargas por lote
Usá **Agregar otra URL** para abrir más campos, o pegá hasta 100 enlaces de una vez, uno por línea. **Descargar enlaces** agrega todo el lote con la calidad y carpeta elegidas. El límite de descargas simultáneas se puede configurar entre 1 y 8 (inicial: 3) y se recuerda al reiniciar. Si bajás el límite, los videos ya iniciados siguen hasta terminar. Los restantes se inician por orden de llegada. Los enlaces repetidos dentro del lote o de videos en curso en la misma carpeta se omiten para evitar que dos procesos escriban el mismo archivo.
