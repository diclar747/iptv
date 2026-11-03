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

## Cartelera de Cinecalidad en el administrador

En la gestión del catálogo, **Cinecalidad · Cartelera** permite consultar una
lista paginada e **Importar todo / buscar novedades**. Cada búsqueda empieza en
la primera página y agrega las fichas faltantes. **Detener** guarda el progreso;
**Reanudar** retoma la página pendiente. También se puede reanudar después de
reiniciar el servidor. El historial identifica el proveedor y registra errores.

Se importan metadatos (título, año, carátula, sinopsis y géneros), sin descargar
videos ni agregar enlaces de reproducción. Las fichas se identifican por su URL
de origen; si ya existe el mismo título y año se vincula esa película. La portada
pública mantiene sus filtros de disponibilidad actuales. La vista previa refleja
el estado al consultarla; usar **Ver lista / actualizar** después de importar.
No requiere clave API. El servidor necesita acceso a `www.cinecalidad.am`; si la
fuente cambia su HTML o bloquea el acceso, se muestra un error y se conserva el
cursor para reintentar. El proceso corre mientras el servidor permanece activo;
la búsqueda de novedades se inicia manualmente desde el administrador.

Endpoints exclusivos de admin: `GET /api/admin/catalog/cinecalidad?page=1`,
`POST /api/admin/catalog/import-cinecalidad` (opcional `{ "resume": true }`),
`POST /api/admin/catalog/cinecalidad/stop`. El progreso se incluye en
`GET /api/admin/catalog/status` y los resultados en el historial existente.

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
