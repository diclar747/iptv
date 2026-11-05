# Deploy en VPS (cd.com.py)

La app es un **servidor Node.js + PostgreSQL** que sirve API + frontend + proxy
en un solo puerto. La base de datos se crea y siembra **sola** al primer arranque
(tablas + admin + revendedor + paquetes). No hay que importar datos.

Requisitos en el servidor: Ubuntu/Debian con SSH (root o sudo), dominio
`cd.com.py` apuntando al VPS.

## 1. Instalar Node 20+ y PostgreSQL

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql git
```

## 2. Crear la base y el usuario

```bash
sudo -u postgres psql -c "CREATE USER iptv WITH PASSWORD 'PONE_UNA_CLAVE_FUERTE';"
sudo -u postgres psql -c "CREATE DATABASE iptv OWNER iptv;"
```

## 3. Clonar y configurar

```bash
git clone https://github.com/diclar747/iptv.git
cd iptv
cp .env.example .env
nano .env     # completar PGPASSWORD (la de arriba), ADMIN_PASSWORD y PORT=4000
npm install
npm run build
```

## 4. Probar

```bash
npm start
```

Debe decir `escuchando en http://localhost:4000` y crear las tablas + usuarios la
primera vez. Probá: `curl http://localhost:4000/api/health`. Cortá con Ctrl+C.

## 5. Dejarlo corriendo siempre (PM2)

```bash
sudo npm install -g pm2
pm2 start npm --name senal -- start
pm2 save
pm2 startup        # ejecutar la línea que imprime, para que arranque con el server
```

## 6. Exponer en el dominio con Nginx + HTTPS

```bash
sudo apt-get install -y nginx
```

`/etc/nginx/sites-available/senal`:

```nginx
server {
    server_name cd.com.py www.cd.com.py;
    client_max_body_size 50m;
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;   # importante para el streaming de los canales
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/senal /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# HTTPS gratis con Let's Encrypt:
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d cd.com.py -d www.cd.com.py
```

Listo: `https://cd.com.py` sirve la app. Entrá con `admin` / la `ADMIN_PASSWORD`
que pusiste, creá revendedores y clientes desde el Panel.

## 7. Actualizar a futuro

```bash
cd iptv
git pull
npm install
npm run build
pm2 restart senal
```

## Notas

- **Seguridad:** cambiá `ADMIN_PASSWORD` y la clave de PostgreSQL por unas fuertes
  (el repo es público). El `.env` no se sube a git (está en `.gitignore`).
- **Contenido:** los canales vienen de iptv-org (enlaces públicos); disponibilidad
  no garantizada y sin derechos de retransmisión de señales premium.
- Películas/series (VOD) están desactivadas por ahora; se reactivan descomentando
  el VOD en `server/src/index.js`.

## Importar videos de YouTube al servidor

El panel permite preparar metadatos y descargar un video individual propio o
con permiso para guardarlo y distribuirlo. No importa listas completas, videos
privados, contenido protegido ni usa cookies para eludir restricciones.

1. Actualizar el repositorio e instalar dependencias como de costumbre.
2. Instalar el descargador oficial sin permisos de administrador:
   ```bash
   npm run setup:youtube
   ```
   El instalador descarga la versión oficial de yt-dlp para Windows, Linux o
   macOS, verifica SHA-256 y la guarda en server/.tools (ignorada por Git).
   También se puede usar una instalación existente con YTDLP_BIN en .env.
3. Para combinar audio y video de alta calidad, instalar FFmpeg. En Ubuntu/Debian:
   ```bash
   sudo apt-get install ffmpeg
   ```
   En otros sistemas instalar FFmpeg y agregarlo al PATH o configurar FFMPEG_BIN
   con su ruta absoluta. Sin FFmpeg se ofrecen los formatos MP4 que ya incluyen
   audio, cuya calidad puede ser menor según el video.
4. Configurar PUBLIC_BASE_URL=https://live.cd.com.py y MEDIA_STORAGE_DIR con una
   carpeta persistente y escribible por el servicio. Si el despliegue reemplaza
   el checkout, la carpeta debe estar FUERA del checkout para no perder videos.
   El valor por defecto data/media solo sirve si el servidor conserva esa carpeta.
5. Ejecutar npm run build y reiniciar el backend. El inicio aplica las tablas
   nuevas y reanuda la cola pendiente; una descarga interrumpida se marca como
   error tras cinco minutos sin actividad y se puede volver a preparar.
6. En Panel → Películas y Series → Importar un video, pegar el enlace, consultar
   sus datos, corregir título/sinopsis/año, elegir tipo y categoría (o crearla),
   indicar el permiso de uso y comenzar. Solo se publica al completar el archivo.

MEDIA_MAX_BYTES limita cada archivo (2 GiB por defecto, hasta 10 GiB). Se
comprueba espacio libre antes de descargar. Los trabajos son persistentes,
se ejecutan de uno en uno y permiten cancelar. Actualizar yt-dlp con el mismo
comando cuando YouTube cambie su formato; reiniciar el servicio al actualizar.

Los archivos y herramientas no se envían a Git. Respaldar tanto PostgreSQL como
MEDIA_STORAGE_DIR. El borrado habitual de una ficha es papelera y conserva su
archivo para restaurarlo. Los medios locales requieren una sesión activa o un
enlace firmado de Cast; admiten solicitudes Range para adelantar el video. El
servidor debe atender conexiones de video largas (proxy_buffering off y tiempos
de espera apropiados en Nginx/hosting). No es necesario exponer la carpeta como
un directorio público.

Referencia de la herramienta: https://github.com/yt-dlp/yt-dlp

## Asistente de Windows y archivos MP4

En Panel → Películas y Series se pueden vincular computadoras con un código
de un solo uso válido diez minutos. El ZIP `livetv-asistente-windows.zip` incluye
Node y yt-dlp: extraerlo completo y abrir `Iniciar LiveTV.cmd`. No necesita
privilegios de administrador, acceso SSH ni la contraseña de LiveTV. La
computadora recibe solo sus trabajos asignados con una credencial revocable.

También se pueden subir MP4 o MKV ya descargados desde el navegador. Ambos
flujos envían fragmentos de 4 MiB verificados con SHA-256 y posición confirmada
por el servidor. Para continuar un envío después de cerrar la página, elegir
el mismo archivo. El servidor requiere FFmpeg y FFprobe para validar el video
y crear una copia MP4 H.264/AAC y su portada. Las conversiones se procesan de una en una en segundo plano. `MEDIA_MAX_BYTES` conserva el límite de 2 GiB por defecto.

El proxy debe permitir PUT y POST de al menos 4 MiB y solicitudes largas para
finalizar/verificar. No cachear `/api/admin` ni `/api/companion`. Respaldar tanto
PostgreSQL como `MEDIA_STORAGE_DIR`. Los archivos incompletos no se publican.

Para regenerar el ZIP desde Windows: `npm run setup:youtube`, luego
`npm run package:companion` y `npm run build`. No incluir medios ni archivos
`connection.json` en Git. El asistente guarda su vinculación y temporales en
`%LOCALAPPDATA%\LiveTV Asistente`; elimina el temporal tras confirmar publicación.
Escucha únicamente en 127.0.0.1:43827 y protege sus acciones con sesión local,
comprobación de origen y un código aleatorio por inicio.

El asistente no usa cuentas ni cookies de YouTube y no omite sus verificaciones.
La disponibilidad depende del video y de la conexión de la computadora.

Las cargas no recodifican el video automáticamente: MP4 se publica sin modificar;
MKV VP9/Opus se remultiplexa a WebM y MKV H.264/AAC a MP4 usando copia de paquetes.
Otros MKV se conservan como originales. La reproducción depende del soporte de
codecs de cada dispositivo. Los fragmentos siempre verifican SHA-256; el checksum
del archivo completo se compara adicionalmente cuando lo envía el cliente.

Pruebas: `node server/scripts/verify-media-transfers.mjs` y
`node server/scripts/verify-companion.mjs`.

Si Downloader YouTuber está abierto en 127.0.0.1:4317 o :4318, el asistente
utiliza su cola y recupera archivos terminados por el identificador de YouTube
en el nombre. No modifica ni elimina los originales. Si no está abierto, usa
su descargador incluido. Los datos completos se consultan desde la computadora.
