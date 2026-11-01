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
