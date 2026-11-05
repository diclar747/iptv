# SEÑAL · IPTV — Catálogo + Reproductor (PWA)

Plataforma IPTV (v0.2) que arma un catálogo navegable de canales a partir de
[iptv-org](https://iptv-org.github.io/), los clasifica por país y categoría,
muestra los logos reales, verifica qué señales están al aire, las reproduce vía
un proxy propio (resuelve CORS) y se instala como **app (PWA)** en el teléfono.

> Esta es la **base técnica** del proyecto. Las funciones de negocio (Super Admin,
> resellers, créditos, suscripciones de clientes) se construyen sobre esta misma
> infraestructura en etapas siguientes. Ver [Próximos pasos](#próximos-pasos).

## Qué hace hoy

- **Importa** los datos de iptv-org (31.712 canales, 18.386 streams, 35.523 logos)
  y los cachea en memoria (refresco cada 6 h o manual).
- **Clasifica** por país (231 países; PY, AR, BR, etc.) y categoría (30 categorías;
  `sports` tiene 2.546 canales, 411 con señal reproducible).
- **Logos reales** de cada canal (elige el mejor de iptv-org por uso y resolución).
- **Busca** por nombre / nombres alternativos.
- **Verifica** qué señales de un canal responden realmente.
- **Reproduce** HLS en el navegador con `hls.js`, a través de un **proxy** que
  reenvía las cabeceras (User-Agent/Referer) y reescribe el manifiesto `.m3u8`
  para que segmentos y claves también pasen por el proxy → sin bloqueos CORS.
- **PWA instalable**: diseño mobile-first ("transmisión en vivo"), service worker
  (app shell offline), manifest e iconos. Se instala en Android, iOS y escritorio.

## Diseño

Mobile-first (uso principal en teléfono). Estética de *señal en vivo*: base
azul-noche, **rojo tally** = al aire / señal activa, cian = foco. Tipografías
Barlow Condensed (display) + Inter (UI) + JetBrains Mono (datos). En teléfono el
reproductor sube como *bottom-sheet*; en escritorio es un panel fijo a la derecha.

## Arquitectura

```
Navegador (React + hls.js, PWA)
        │  /api  (mismo origen en prod)
        ▼
Backend Express  ──▶  iptv-org API (channels/streams/logos JSON)
  · /api/stream  = proxy HLS (cabeceras + CORS + reescritura de manifiesto)
  · sirve web/dist en producción
```

- `server/` — API REST + proxy (Node 24, ESM).
  - `src/iptvSource.js` — descarga, cache, índices (canal↔streams↔logo), consultas.
  - `src/checker.js` — verificación de señales activas.
  - `src/proxy.js` — proxy de reproducción (reescritura HLS, cabeceras, streaming).
  - `src/index.js` — endpoints + static del frontend compilado.
- `web/` — SPA React con Vite. `public/` tiene manifest, `sw.js` e iconos del PWA.

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/meta` | Países y categorías con canales |
| GET | `/api/channels?country=PY&category=sports&search=&page=1` | Listado paginado (con logo) |
| GET | `/api/channels/:id/streams` | Señales de un canal |
| GET | `/api/channels/:id/check` | Verifica cuáles señales responden |
| GET | `/api/stream?url=...&ua=...&ref=...` | **Proxy** de reproducción (CORS + cabeceras) |
| GET | `/api/check?url=...` | Verifica una URL suelta |
| POST | `/api/refresh` | Fuerza refresco del cache de iptv-org |

## Capa de negocio (Admin · Resellers · Créditos · Clientes)

Sobre PostgreSQL. Jerarquía: **Admin** crea resellers y les asigna créditos y
define paquetes → **Reseller** gasta créditos para crear/renovar **Clientes** →
el Cliente entra con usuario/contraseña y ve el catálogo solo si su suscripción
está activa. Paquetes configurables (duración, costo en créditos, conexiones
simultáneas). Control de conexiones simultáneas por cliente (`max_connections`).

- Tablas: `users` (admin/reseller/client), `packages`, `transactions` (auditoría
  de créditos). Esquema en `server/db/schema.sql` (se crea solo al arrancar).
- Auth por cookie de sesión; contraseñas con scrypt. El catálogo y el proxy de
  reproducción quedan detrás del login + suscripción activa.
- **Usuario admin inicial:** `admin` / `admin123` (cambiá la contraseña; se puede
  fijar con la variable `ADMIN_PASSWORD`). Se crean paquetes de ejemplo al inicio.

### PostgreSQL (requisito)

Creá la base y el usuario una vez (como superusuario `postgres`):

```sql
CREATE USER iptv WITH PASSWORD 'iptv';
CREATE DATABASE iptv OWNER iptv;
GRANT ALL PRIVILEGES ON DATABASE iptv TO iptv;
```

Conexión por defecto: `localhost:5432`, base `iptv`, usuario `iptv`, clave `iptv`.
Se puede override con `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD` o `DATABASE_URL`.

## Cómo correrlo

Requisitos: Node 18+ (probado con Node 24) y PostgreSQL (ver arriba).

**Desarrollo** (dos servidores, con HMR):

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173 · API: http://localhost:4000

**Producción / probar el PWA** (un solo origen en :4000):

```bash
npm run build
npm start
```

- App completa (frontend + API + proxy): http://localhost:4000
- El service worker y la instalación del PWA requieren este modo (un solo origen).

## Notas importantes

- **Fuente de datos:** iptv-org es un directorio comunitario de enlaces públicos.
  No garantiza disponibilidad ni canales premium (ESPN, DSports, TyC, etc.), y los
  enlaces **no conceden derechos de retransmisión**. Para distribuir señales
  comerciales a clientes hace falta un acuerdo de distribución con el titular de
  los derechos. Esta base sirve para desarrollar y probar; el contenido con
  licencia se incorpora después como fuentes adicionales.
- Muchas señales están caídas o geo-bloqueadas (normal en iptv-org); por eso está
  el verificador. El proxy reenvía cabeceras, pero no elude geo-bloqueos ni DRM.

## Próximos pasos

1. **Fuentes adicionales** además de iptv-org (listas M3U propias, proveedores con
   autorización de redistribución).
2. **Persistencia** (base de datos) para canales curados, favoritos y estado de
   verificación histórico.
3. **Capa de negocio:** Super Admin · resellers · créditos · suscripciones ·
   usuarios/clientes con control de acceso.
4. **Verificación en segundo plano** periódica para mostrar sólo canales que andan.
5. **Afinar el verificador** (hoy marca "activo" por HTTP 200; algunos orígenes
   devuelven HTML/error con 200 — validar que el cuerpo sea un manifiesto real).

## Importar películas y series de Internet Archive

Ejecutar `npm run import:vod` con PostgreSQL disponible y acceso a archive.org.
El importador agrega películas sin borrar el catálogo y omite identificadores ya
importados. Las series existentes se conservan. Selecciona archivos MP4 derivados
H.264 y filtra candidatos con licencias declaradas CC0/dominio público, CC BY o
CC BY-SA. La declaración del usuario que subió el archivo requiere revisión antes
de distribuirlo; conservar atribuciones y condiciones de cada título.

Referencia de arquitectura: https://github.com/amponce/archive-movie-browser
Ese proyecto contiene un navegador/reproductor; los videos provienen de Internet
Archive. Esta integración usa directamente Archive y no copia código del proyecto.
No requiere una clave TMDB. El idioma depende de cada archivo original.

El catálogo muestra películas con fuente de reproducción. Se retiró la integración
de Cinecalidad y la importación de fichas sin video. Al iniciar el backend, las
fichas importadas sin stream ni fuente vinculada quedan ocultas; sus datos se
conservan y los títulos con fuente mantienen su visibilidad.

## LiveTV APK 1.18

- Pestaña Radios: emisoras paraguayas, búsqueda por nombre/ciudad, reproducción
  de audio y votos. Incluye las señales oficiales de San Fernando y Triunfo.
- API autenticada: GET /api/radios?search=nombre. Combina una lista verificada
  con Radio Browser, elimina duplicados y conserva la lista local si falla el
  directorio. Los enlaces pueden dejar de funcionar; no cubre todas las radios
  del país. Actualizar señales: npm run import:radios.
- Los votos usan POST /api/catalog/likes con value 1 o -1 (omitir value conserva
  compatibilidad con las APK anteriores). Repetir el voto lo quita; cambiarlo
  reemplaza la elección. La migración conserva los votos positivos existentes.
- Botón TV: búsqueda Google Cast, configuración Wi-Fi y acceso a transmisión de
  pantalla de Android para dispositivos compatibles. Teléfono y TV deben estar
  en la misma red sin aislamiento. Miracast y Google Cast son métodos diferentes.
- Desplegar backend y APK juntos: el inicio aplica la migración SQL; la APK
  actualizable se publica en /cinetv.apk para mantener el enlace existente.

## LiveTV APK 1.19 — Radio Studio

Diseño de radios con logos, filtros y estados online/offline/revisando. El servidor
comprueba que cada URL entregue audio, con seis consultas simultáneas y caché
de tres minutos; la APK actualiza la lista cada ocho segundos mientras se usa.
El estado indica disponibilidad desde el servidor, no una garantía permanente.
Las emisoras offline se muestran en su filtro y no inician reproducción.

El reproductor de radio incluye imagen local de estudio, controles propios,
volumen, animación ambiental durante reproducción y votos con iconos de pulgar.
La etiqueta En vivo depende del estado real del reproductor. Actualizar backend
y APK juntos para que funcione la verificación de las señales.

## LiveTV APK 1.20 — Diseño unificado y Desde Paraguay

Canales en vivo con buscador, filtros, vista lista/cuadrícula y paginación. Inicio
con accesos a TV, radios y películas; portada, fichas y acceso con fondo propio
de estudio de TV. El reproductor conserva sus controles nativos y agrega una
cabecera con el estado real de reproducción que se oculta con los controles.

Desde Paraguay: el importador compara el catálogo con las emisoras existentes
por nombre y frecuencia. Conserva las páginas de origen y obtiene las direcciones
HLS temporales al reproducir, sin almacenar firmas vencidas en el catálogo.
Comando: npm run import:radios:desdeparaguay. Los estados siguen siendo
comprobaciones del servidor; la disponibilidad puede cambiar.

Desplegar backend y APK 1.20 juntos para las radios con enlaces temporales.

## LiveTV 1.21 — Administración del catálogo y señales

Panel → Canales reúne el proveedor y los canales propios, con búsqueda, filtros
por país/categoría/origen/estado, edición de metadatos y múltiples URLs, alta,
bloqueo, papelera/restauración y restablecimiento de datos originales. Las
correcciones se guardan en PostgreSQL y sobreviven a la actualización del proveedor.
Panel → Películas y Series incluye la lista administrable de películas y sus fuentes.

Se puede verificar un canal, el país/categoría seleccionado o todo el catálogo,
con progreso y detención de la revisión. El verificador comprueba datos de medios,
incluidos segmentos HLS, y rechaza páginas HTML que devuelven HTTP 200. La fuente
comprobada como activa tiene prioridad. El estado dura 15 minutos; después aparece
sin verificar. Paraguay se revisa al iniciar y cada 10 minutos. Los canales con
restricciones pueden aparecer offline desde el servidor aunque estén al aire.
Web y APK muestran estados; la APK actualiza los canales visibles periódicamente.
La corrección inicial de C9N utiliza la señal publicada en su página oficial y
solo se aplica si no existe una edición previa del administrador.

Despliegue: actualizar el repositorio, instalar dependencias, ejecutar npm run build
y reiniciar el backend. El inicio aplica las nuevas tablas/columnas automáticamente.
Publicar también la APK 1.21 incluida en web/public/cinetv.apk; conserva el enlace
de descarga y la firma de actualización. No es necesario volver a importar canales.

Validación: node --test server/src/checker.test.js server/src/radio.test.js
server/src/desdeparaguay.test.js. Prueba de administración con PostgreSQL disponible:
node server/scripts/verify-management.mjs (crea y limpia únicamente sus fixtures).

## LiveTV 1.22 — Conversación y compartir

Canales y radios incluyen pulgares positivo/negativo, conversación con avatar de
iniciales y nombre del usuario, fecha, emojis y cinco reacciones por comentario.
Una persona mantiene una reacción por comentario: tocarla de nuevo la quita y
seleccionar otra la cambia. Los comentarios se actualizan cada cinco segundos
con el panel abierto en Android; la web consulta mientras se muestra el visor.
Se muestran los últimos cien. Cada usuario elimina sus propios comentarios y el
administrador también puede moderarlos desde la web. Se limita el envío a un
comentario cada cinco segundos por cuenta y a quinientos caracteres.

Compartir abre el selector nativo (WhatsApp y demás aplicaciones instaladas).
En web hay alternativas WhatsApp/Facebook/copiar enlace cuando el navegador no
ofrece compartir. Los enlaces contienen el canal o radio y se abren en la web;
si hace falta iniciar sesión, se conserva el destino. Se agregó la sección de
radios a la web. Yvy Pytá 94.1 FM de Hohenau se incorporó al catálogo fijo con
su señal comprobada; la dirección se obtuvo del directorio Online Radio Box,
que identifica y enlaza el sitio oficial de la emisora.

Desplegar backend y web juntos y publicar la APK 1.22. La tabla de reacciones a
comentarios se crea al iniciar, conservando votos y comentarios anteriores.
Validación social con PostgreSQL local: node server/scripts/verify-social.mjs.

## LiveTV 1.23 — Carga progresiva y chat compacto

La APK carga radios, canales, películas y series de diez en diez y agrega la
siguiente página al acercarse al final de la lista. Buscar o cambiar filtros
reinicia el recorrido; los resultados tardíos de una búsqueda previa se descartan.
Los canales propios y del proveedor comparten una sola paginación, sin exceder
el tamaño de página ni saltar elementos en la transición.

Las radios responden desde el catálogo local sin esperar al directorio externo;
este se actualiza en segundo plano. Cada recorrido conserva una instantánea del
catálogo para mantener el orden mientras se cargan páginas. Los estados se
consultan para los elementos visibles, con caché compartida, deduplicación y
colas acotadas (cuatro radios simultáneas). Se quitó la revisión automática
completa de canales al iniciar y cada diez minutos: la revisión general sigue
estando disponible en el administrador. Los filtros online/offline muestran
señales ya comprobadas; no arrancan una exploración completa. La web también
carga radios progresivamente y consulta solo las tarjetas visibles.

El chat se abre expandido. El encabezado y la entrada de texto permanecen fuera
de la lista desplazable; el campo se ajusta al teclado. Las burbujas usan su
altura natural y las acciones visibles son pulgar arriba/abajo; el selector de
emojis queda en el campo de escritura y eliminar está en el menú del comentario.
Las consultas periódicas se pausan al ocultar la app, manteniendo el audio del
servicio. Las reacciones antiguas se conservan en la base de datos.

Pruebas: radio-queue.test.js y radio-pagination.test.js comprueban deduplicación,
concurrencia, respuesta inicial sin esperar al directorio y continuidad de las
páginas; verify-pagination.mjs valida la transición de canales propios/proveedor;
verify-social.mjs valida publicación, permisos y pulgares. La APK y la web se
compilan; no se hizo una prueba visual en Android porque el emulador disponible
requiere aceleración de hardware que no está habilitada en este equipo.
Desplegar backend, web y APK 1.23 juntos. El inicio aplica la migración SQL.

## LiveTV 1.24 — Fiabilidad de radios y plan mensual

Precio publicado del plan: Gs. 27.500 mensuales.

El verificador comprueba medios reales, incluyendo segmentos HLS. Un fallo de
red, permiso, timeout o respuesta temporal se identifica como error de
comprobación, no como emisora offline. La ausencia de señal se confirma solo
ante fuentes eliminadas o respuestas 404/410. El resultado online se conserva
hasta treinta minutos con indicador de actualización; se renueva desde los tres
minutos. Los errores pueden reintentarse después de un minuto.

Desde Paraguay: se extraen ambas señales que publica cada página. El verificador
y el proxy prueban las dos, cancelan la que pierde y prefieren la que responde.
Las firmas temporales permanecen solo en memoria durante treinta segundos y
nunca se guardan en el catálogo. También se conservan las alternativas del
directorio externo al unir emisoras duplicadas. Centenario usa una fuente AAC
independiente comprobada localmente y por el servidor publicado; Cardinal 730
prioriza su página de transmisión sobre el enlace directo que fallaba.

El filtro online descubre emisoras en lotes limitados cuando faltan resultados,
responde inmediatamente y muestra progreso en la APK. Permite seguir buscando
más allá de las primeras diez; las señales ya confirmadas se ordenan por su
primera comprobación para evitar movimientos al descubrir nuevas. Abrir una
radio utiliza GET /api/radios/:id/playback: comparte la verificación existente y
entrega la fuente y el formato correctos para HLS/AAC/MP3 en la web y APK.

El proxy aborta al desconectarse la respuesta, no al completarse la petición
HTTP. La espera inicial está acotada y devuelve errores JSON, mientras que una
transmisión ya iniciada continúa sin ese límite. Los fallos registran etapa,
host y código de error, sin firmas ni URL completas. Diagnóstico de administrador:
POST /api/admin/radios/diagnostics con {"ids":["desde-abc","desde-centenario"]}.

Desplegar backend y web, reiniciar el servicio y publicar la APK 1.24 incluida.
No hay migración de base de datos nueva. Los estados se reconstruyen al reiniciar;
no se debe confundir una señal pendiente de comprobar con una emisora apagada.
Se comprobaron respuestas de audio y las pruebas automatizadas; queda pendiente
confirmar en producción la estabilidad de ABC después del despliegue, pues el
servidor anterior mostró respuestas intermitentes incluso en su segundo CDN.

## LiveTV 1.25 — Prueba personal de 24 horas y caché persistente

Web y APK permiten crear una cuenta propia y entrar automáticamente con 24 horas
gratuitas desde el registro, sin tarjeta. El vencimiento se calcula en el
servidor; iniciar sesión nuevamente no lo extiende. El registro siempre crea un
cliente con una conexión, ignora privilegios/fechas enviados por el visitante y
valida usuario y contraseña (mínimo ocho caracteres). La cuenta demo compartida
sin vencimiento deja de crearse y se deshabilita al iniciar si corresponde a la
cuenta demo original del sistema. No se modifican las otras cuentas.

Al vencer se bloquean las API de reproducción y se corta una transmisión directa
que ya estuviera abierta. Los enlaces firmados para Smart TV incluyen vencimiento,
limitado también por el plazo de la cuenta, y sus segmentos no pueden extenderlo.
Los enlaces antiguos de cast deben regenerarse. STREAM_SECRET en .env permite
conservar la firma entre reinicios; si falta se genera una clave privada en memoria.
La APK muestra la pantalla de renovación por Gs. 27.500 mensuales y permite cerrar
sesión. La prueba pública dura siempre 24 horas; TRIAL_HOURS deja de configurarla.

Las comprobaciones de radio y el directorio externo se guardan en PostgreSQL.
Se restauran antes de abrir el servicio: volver a abrir la app o reiniciar el
backend ya no borra las comprobaciones guardadas. Los resultados de hasta 24 horas
se muestran como último estado conocido, con fecha y aviso de actualización cuando
corresponde. No se fuerza online una emisora nunca comprobada. La primera
instalación necesita llenar la caché; en adelante se reutiliza.

Dos tareas de mantenimiento comparten la cola global de cuatro verificaciones
con los usuarios. Refrescan en segundo plano los resultados online de más de diez
minutos, los offline de más de treinta y los errores de más de cinco. Las tarjetas
visibles pueden actualizarse antes. Se guardan catálogo y resultados, no audio,
archivos de video ni firmas temporales de los CDN. La caché existente de imágenes
y del catálogo de canales se conserva.

Desplegar backend y web, reiniciar para aplicar las dos tablas nuevas y publicar
la APK 1.25. Validación: verify-trial.mjs comprueba registro, sesión, privilegios,
24 horas exactas y vencimiento; verify-radio-cache.mjs guarda/restaura un resultado
real en PostgreSQL. Las pruebas unitarias verifican restauración, concurrencia,
continuidad del audio y caducidad de enlaces HLS. Compilaciones web y APK correctas.
