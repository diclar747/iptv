// Capa de negocio: autenticación, resellers, créditos, paquetes, clientes
// y control de conexiones simultáneas. Expone un router Express montado en /api.

import express from 'express';
import { query, one, many, tx } from './pg.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  tokenFromReq,
  publicUser,
  requireAuth,
  requireRole,
  subscriptionStatus,
} from './auth.js';

function httpError(status, message, extra) {
  const e = new Error(message);
  e.status = status;
  if (extra) e.extra = extra;
  return e;
}

// Envuelve handlers async y uniformiza el manejo de errores.
function h(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      const status = err.status || 500;
      if (status === 500) console.error('[accounts]', err);
      res.status(status).json({ error: err.message, ...(err.extra || {}) });
    });
  };
}

// Normaliza un monto en guaraníes: null si vacío/ inválido, si no número >= 0.
function money(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Vista de un paquete para el frontend (camelCase, precios numéricos).
function packageDTO(p) {
  return {
    id: p.id,
    name: p.name,
    durationDays: p.duration_days,
    credits: p.credits,
    maxConnections: p.max_connections,
    active: p.active,
    adminPrice: p.admin_price != null ? Number(p.admin_price) : null,
    suggestedPrice: p.suggested_price != null ? Number(p.suggested_price) : null,
  };
}

// ---------- Seed inicial ----------
export async function ensureSeed() {
  const admin = await one("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (!admin) {
    const pass = process.env.ADMIN_PASSWORD || 'admin123';
    const { salt, hash } = hashPassword(pass);
    await query(
      "INSERT INTO users (username, pass_hash, pass_salt, role) VALUES ('admin', $1, $2, 'admin')",
      [hash, salt]
    );
    console.log(`[seed] usuario admin creado -> admin / ${pass}`);
  }
  // Seguridad: si ADMIN_PASSWORD está definido, sincroniza la clave del admin en
  // cada arranque. Permite cambiarla desde las variables de entorno del hosting.
  if (process.env.ADMIN_PASSWORD) {
    const { salt, hash } = hashPassword(process.env.ADMIN_PASSWORD);
    await query("UPDATE users SET pass_hash=$1, pass_salt=$2 WHERE role='admin'", [hash, salt]);
  }
  // Reseller de prueba con saldo (solo si no hay ninguno). Cambiá la clave luego.
  const anyReseller = await one("SELECT id FROM users WHERE role = 'reseller' LIMIT 1");
  if (!anyReseller) {
    const adminRow = await one("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
    const pass = process.env.RESELLER_PASSWORD || 'vendedor123';
    const credits = 100;
    const { salt, hash } = hashPassword(pass);
    const r = await one(
      `INSERT INTO users (username, pass_hash, pass_salt, role, credits, created_by)
       VALUES ('vendedor', $1, $2, 'reseller', $3, $4) RETURNING id`,
      [hash, salt, credits, adminRow?.id || null]
    );
    await query(
      `INSERT INTO transactions (type, amount, reseller_id, by_user_id, note)
       VALUES ('allocate', $1, $2, $3, 'Créditos de prueba')`,
      [credits, r.id, adminRow?.id || null]
    );
    console.log(`[seed] reseller de prueba -> vendedor / ${pass} (${credits} créditos)`);
  }
  // Seguridad: si RESELLER_PASSWORD está definido, sincroniza la clave del
  // vendedor de prueba en cada arranque.
  if (process.env.RESELLER_PASSWORD) {
    const { salt, hash } = hashPassword(process.env.RESELLER_PASSWORD);
    await query("UPDATE users SET pass_hash=$1, pass_salt=$2 WHERE username='vendedor'", [hash, salt]);
  }

  // Cuenta DEMO de acceso libre para probar el sistema: es un "vendedor" (así
  // tiene acceso total y no vence). Cualquiera entra con demo / demo.
  const demo = await one("SELECT id FROM users WHERE username='demo'");
  if (!demo) {
    const { salt, hash } = hashPassword(process.env.DEMO_PASSWORD || 'demo');
    await query(
      "INSERT INTO users (username, pass_hash, pass_salt, role, credits) VALUES ('demo',$1,$2,'reseller',50)",
      [hash, salt]
    );
    console.log('[seed] cuenta demo creada -> demo / demo (acceso libre)');
  }

  const { n } = await one('SELECT count(*)::int AS n FROM packages');
  if (n === 0) {
    const defaults = [
      ['1 Mes', 30, 1, 1],
      ['3 Meses', 90, 3, 1],
      ['6 Meses', 180, 5, 1],
      ['12 Meses', 365, 10, 2],
      ['1 Mes · 2 pantallas', 30, 2, 2],
    ];
    for (const [name, days, credits, conns] of defaults) {
      await query(
        'INSERT INTO packages (name, duration_days, credits, max_connections) VALUES ($1,$2,$3,$4)',
        [name, days, credits, conns]
      );
    }
    console.log('[seed] paquetes por defecto creados');
  }
}

// ---------- Control de conexiones simultáneas (en memoria) ----------
const SESSION_TTL = 45_000; // sin heartbeat en 45s => conexión liberada
const watch = new Map(); // clientId -> Map(sessionId -> lastSeen)

function pruneWatch(clientId) {
  const m = watch.get(clientId);
  if (!m) return 0;
  const now = Date.now();
  for (const [sid, seen] of m) if (now - seen > SESSION_TTL) m.delete(sid);
  if (m.size === 0) watch.delete(clientId);
  return m.size;
}
function activeConnections(clientId) {
  return pruneWatch(clientId);
}

// ---------- Router ----------
const router = express.Router();

// --- Auth ---
router.post(
  '/auth/login',
  h(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) throw httpError(400, 'Faltan credenciales');
    const u = await one('SELECT * FROM users WHERE username = $1', [username]);
    if (!u || !verifyPassword(password, u.pass_salt, u.pass_hash)) {
      throw httpError(401, 'Usuario o contraseña incorrectos');
    }
    if (u.status !== 'active') throw httpError(403, 'Cuenta deshabilitada');
    const token = createSession(u.id);
    setSessionCookie(res, token);
    res.json({ user: publicUser(u) });
  })
);

// Registro público con PRUEBA GRATIS: cualquiera crea su cuenta y queda activo
// por TRIAL_HOURS horas, sin consumir créditos de ningún reseller. Al vencer,
// ve la pantalla de "suscripción vencida" y un reseller puede renovarlo.
const TRIAL_HOURS = parseInt(process.env.TRIAL_HOURS, 10) || 24;

router.post(
  '/auth/register',
  h(async (req, res) => {
    const username = (req.body?.username || '').trim();
    const password = req.body?.password || '';
    if (!username || !password) throw httpError(400, 'Usuario y contraseña requeridos');
    if (username.length < 3) throw httpError(400, 'El usuario debe tener al menos 3 caracteres');
    if (password.length < 4) throw httpError(400, 'La contraseña debe tener al menos 4 caracteres');
    // Afiliados: si viene ?ref=<usuario de un vendedor activo>, el nuevo cliente
    // queda asignado a ese vendedor (lo ve en su panel y puede renovarlo).
    let parentId = null;
    const ref = (req.body?.ref || '').trim();
    if (ref) {
      const r = await one("SELECT id FROM users WHERE username=$1 AND role='reseller' AND status='active'", [ref]);
      if (r) parentId = r.id;
    }
    const { salt, hash } = hashPassword(password);
    let row;
    try {
      row = await one(
        `INSERT INTO users (username, pass_hash, pass_salt, role, parent_id, created_by, expires_at, max_connections, package_name)
         VALUES ($1,$2,$3,'client',$4,$4, now() + ($5 || ' hours')::interval, 1, $6) RETURNING *`,
        [username, hash, salt, parentId, TRIAL_HOURS, `Prueba gratis ${TRIAL_HOURS}h`]
      );
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'Ese usuario ya existe, probá con otro');
      throw e;
    }
    const token = createSession(row.id);
    setSessionCookie(res, token);
    res.status(201).json({ user: publicUser(row) });
  })
);

router.post('/auth/logout', (req, res) => {
  const t = tokenFromReq(req);
  if (t) destroySession(t);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/auth/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// --- Perfil (datos de marca/contacto; el vendedor edita el suyo) ---
function profileDTO(u) {
  const out = publicUser(u);
  if (u.role === 'reseller') out.affiliateCode = u.username;
  return out;
}

router.get('/profile', requireAuth, h(async (req, res) => {
  res.json(profileDTO(req.user));
}));

router.patch(
  '/profile',
  requireAuth,
  h(async (req, res) => {
    const b = req.body || {};
    const { displayName, logoUrl, phone, address } = b;
    if (logoUrl && String(logoUrl).length > 300000) throw httpError(400, 'La imagen es muy grande (máx ~200KB)');
    const cut = (v, n) => (v == null || v === '' ? null : String(v).slice(0, n));
    const row = await one(
      `UPDATE users SET display_name=$1, logo_url=$2, phone=$3, address=$4,
         bank_name=$5, bank_holder=$6, bank_account=$7, bank_alias=$8, bank_doc=$9
       WHERE id=$10 RETURNING *`,
      [cut(displayName, 80), logoUrl || null, cut(phone, 40), cut(address, 200),
       cut(b.bankName, 80), cut(b.bankHolder, 120), cut(b.bankAccount, 60), cut(b.bankAlias, 80), cut(b.bankDoc, 40),
       req.user.id]
    );
    res.json(profileDTO(row));
  })
);

// Datos de pago del "proveedor" del usuario actual: a quién le paga por
// transferencia. Para un cliente o sub-vendedor es su padre; para un
// distribuidor de primer nivel (sin padre) es el super admin.
router.get(
  '/billing/provider',
  requireAuth,
  h(async (req, res) => {
    let provider = null;
    if (req.user.parent_id) {
      provider = await one('SELECT * FROM users WHERE id=$1', [req.user.parent_id]);
    }
    if (!provider) {
      provider = await one("SELECT * FROM users WHERE role='admin' ORDER BY id LIMIT 1");
    }
    if (!provider) return res.json(null);
    res.json({
      username: provider.username,
      displayName: provider.display_name || null,
      phone: provider.phone || null,
      bankName: provider.bank_name || null,
      bankHolder: provider.bank_holder || null,
      bankAccount: provider.bank_account || null,
      bankAlias: provider.bank_alias || null,
      bankDoc: provider.bank_doc || null,
    });
  })
);

// --- Precios de reventa del vendedor (en guaraníes) ---
router.get(
  '/reseller/prices',
  requireRole('reseller'),
  h(async (req, res) => {
    const rows = await many(
      `SELECT p.id, p.name, p.duration_days, p.credits, p.max_connections,
              p.admin_price, p.suggested_price, rp.price
       FROM packages p
       LEFT JOIN reseller_prices rp ON rp.package_id = p.id AND rp.reseller_id = $1
       WHERE p.active ORDER BY p.credits`,
      [req.user.id]
    );
    res.json(rows.map((p) => ({
      id: p.id, name: p.name, durationDays: p.duration_days, credits: p.credits,
      maxConnections: p.max_connections,
      adminPrice: p.admin_price != null ? Number(p.admin_price) : null,
      suggestedPrice: p.suggested_price != null ? Number(p.suggested_price) : null,
      price: p.price != null ? Number(p.price) : null,
    })));
  })
);

router.patch(
  '/reseller/prices',
  requireRole('reseller'),
  h(async (req, res) => {
    const packageId = parseInt(req.body?.packageId, 10);
    if (!packageId) throw httpError(400, 'Paquete inválido');
    const pkg = await one('SELECT id FROM packages WHERE id=$1', [packageId]);
    if (!pkg) throw httpError(404, 'Paquete no encontrado');
    const raw = req.body?.price;
    if (raw == null || raw === '') {
      await query('DELETE FROM reseller_prices WHERE reseller_id=$1 AND package_id=$2', [req.user.id, packageId]);
    } else {
      const price = Number(raw);
      if (!Number.isFinite(price) || price < 0) throw httpError(400, 'Precio inválido');
      await query(
        `INSERT INTO reseller_prices (reseller_id, package_id, price) VALUES ($1,$2,$3)
         ON CONFLICT (reseller_id, package_id) DO UPDATE SET price = EXCLUDED.price`,
        [req.user.id, packageId, price]
      );
    }
    res.json({ ok: true });
  })
);

// --- Control de conexiones (visor) ---
router.post(
  '/watch/start',
  requireAuth,
  h(async (req, res) => {
    const u = req.user;
    const sub = subscriptionStatus(u);
    if (!sub.active) throw httpError(403, 'Suscripción inactiva', { reason: sub.reason });

    const sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    if (u.role === 'client') {
      const active = activeConnections(u.id);
      if (active >= (u.max_connections || 1)) {
        throw httpError(429, 'Límite de conexiones alcanzado', {
          max: u.max_connections || 1,
          active,
        });
      }
      if (!watch.has(u.id)) watch.set(u.id, new Map());
      watch.get(u.id).set(sessionId, Date.now());
    }
    res.json({ sessionId, max: u.max_connections || null });
  })
);

router.post('/watch/heartbeat', requireAuth, (req, res) => {
  const { sessionId } = req.body || {};
  const m = watch.get(req.user.id);
  if (m && sessionId && m.has(sessionId)) m.set(sessionId, Date.now());
  res.json({ ok: true });
});

router.post('/watch/stop', requireAuth, (req, res) => {
  const { sessionId } = req.body || {};
  const m = watch.get(req.user.id);
  if (m && sessionId) m.delete(sessionId);
  res.json({ ok: true });
});

// ================= ADMIN =================
router.get(
  '/admin/stats',
  requireRole('admin'),
  h(async (req, res) => {
    const stats = await one(`
      SELECT
        (SELECT count(*)::int FROM users WHERE role = 'reseller') AS resellers,
        (SELECT count(*)::int FROM users WHERE role = 'client') AS clients,
        (SELECT count(*)::int FROM users WHERE role = 'client' AND status = 'active'
            AND (expires_at IS NULL OR expires_at > now())) AS clients_active,
        (SELECT coalesce(sum(credits),0)::int FROM users WHERE role = 'reseller') AS credits_in_circulation,
        (SELECT count(*)::int FROM packages WHERE active) AS packages
    `);
    res.json(stats);
  })
);

router.get(
  '/admin/resellers',
  requireRole('admin'),
  h(async (req, res) => {
    const rows = await many(`
      SELECT u.*, (SELECT count(*)::int FROM users c WHERE c.parent_id = u.id) AS client_count
      FROM users u WHERE u.role = 'reseller' ORDER BY u.created_at DESC
    `);
    res.json(rows.map((r) => ({ ...publicUser(r), clientCount: r.client_count })));
  })
);

router.post(
  '/admin/resellers',
  requireRole('admin'),
  h(async (req, res) => {
    const { username, password, credits = 0 } = req.body || {};
    if (!username || !password) throw httpError(400, 'Usuario y contraseña requeridos');
    const { salt, hash } = hashPassword(password);
    let row;
    try {
      row = await one(
        `INSERT INTO users (username, pass_hash, pass_salt, role, credits, created_by)
         VALUES ($1,$2,$3,'reseller',$4,$5) RETURNING *`,
        [username, hash, salt, Math.max(0, parseInt(credits, 10) || 0), req.user.id]
      );
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'Ese usuario ya existe');
      throw e;
    }
    if (row.credits > 0) {
      await query(
        `INSERT INTO transactions (type, amount, reseller_id, by_user_id, note)
         VALUES ('allocate',$1,$2,$3,'Créditos iniciales')`,
        [row.credits, row.id, req.user.id]
      );
    }
    res.status(201).json(publicUser(row));
  })
);

router.post(
  '/admin/resellers/:id/credits',
  requireRole('admin'),
  h(async (req, res) => {
    const amount = parseInt(req.body?.amount, 10);
    const note = req.body?.note || null;
    if (!amount) throw httpError(400, 'Monto inválido');
    const updated = await tx(async (c) => {
      const r = await c.query("SELECT * FROM users WHERE id=$1 AND role='reseller' FOR UPDATE", [req.params.id]);
      if (!r.rows[0]) throw httpError(404, 'Reseller no encontrado');
      if (r.rows[0].credits + amount < 0) throw httpError(400, 'Dejaría créditos en negativo');
      const upd = await c.query('UPDATE users SET credits = credits + $1 WHERE id=$2 RETURNING *', [amount, req.params.id]);
      await c.query(
        `INSERT INTO transactions (type, amount, reseller_id, by_user_id, note)
         VALUES ($1,$2,$3,$4,$5)`,
        [amount >= 0 ? 'allocate' : 'refund', Math.abs(amount), req.params.id, req.user.id, note]
      );
      return upd.rows[0];
    });
    res.json(publicUser(updated));
  })
);

router.patch(
  '/admin/resellers/:id',
  requireRole('admin'),
  h(async (req, res) => {
    const { status } = req.body || {};
    if (!['active', 'disabled'].includes(status)) throw httpError(400, 'Estado inválido');
    const row = await one("UPDATE users SET status=$1 WHERE id=$2 AND role='reseller' RETURNING *", [status, req.params.id]);
    if (!row) throw httpError(404, 'Reseller no encontrado');
    res.json(publicUser(row));
  })
);

// --- Paquetes (admin) ---
router.get(
  '/packages',
  requireAuth,
  h(async (req, res) => {
    // Resellers/clientes solo ven activos; admin ve todos.
    const rows =
      req.user.role === 'admin'
        ? await many('SELECT * FROM packages ORDER BY credits')
        : await many('SELECT * FROM packages WHERE active ORDER BY credits');
    res.json(rows.map(packageDTO));
  })
);

router.post(
  '/admin/packages',
  requireRole('admin'),
  h(async (req, res) => {
    const { name, durationDays, credits, maxConnections = 1, adminPrice, suggestedPrice } = req.body || {};
    if (!name || !durationDays || credits == null) throw httpError(400, 'Datos incompletos');
    const p = await one(
      `INSERT INTO packages (name, duration_days, credits, max_connections, admin_price, suggested_price)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, parseInt(durationDays, 10), parseInt(credits, 10), parseInt(maxConnections, 10) || 1,
       money(adminPrice), money(suggestedPrice)]
    );
    res.status(201).json(packageDTO(p));
  })
);

router.patch(
  '/admin/packages/:id',
  requireRole('admin'),
  h(async (req, res) => {
    const b = req.body || {};
    // Edición parcial: solo actualiza los campos presentes en el body.
    const sets = [];
    const vals = [];
    const add = (col, val) => { sets.push(`${col}=$${sets.length + 1}`); vals.push(val); };
    if (b.name != null) add('name', String(b.name).slice(0, 120));
    if (b.durationDays != null) add('duration_days', parseInt(b.durationDays, 10));
    if (b.credits != null) add('credits', parseInt(b.credits, 10));
    if (b.maxConnections != null) add('max_connections', parseInt(b.maxConnections, 10) || 1);
    if (b.adminPrice !== undefined) add('admin_price', money(b.adminPrice));
    if (b.suggestedPrice !== undefined) add('suggested_price', money(b.suggestedPrice));
    if (b.active != null) add('active', !!b.active);
    if (!sets.length) throw httpError(400, 'Nada para actualizar');
    vals.push(req.params.id);
    const p = await one(`UPDATE packages SET ${sets.join(', ')} WHERE id=$${vals.length} RETURNING *`, vals);
    if (!p) throw httpError(404, 'Paquete no encontrado');
    res.json(packageDTO(p));
  })
);

// ================= RESELLER (y admin) =================
router.get(
  '/reseller/me',
  requireRole('reseller', 'admin'),
  h(async (req, res) => {
    const isAdmin = req.user.role === 'admin';
    const scope = isAdmin ? '' : 'WHERE parent_id = $1';
    const params = isAdmin ? [] : [req.user.id];
    const counts = await one(
      `SELECT
         count(*)::int AS total,
         count(*) FILTER (WHERE status='active' AND (expires_at IS NULL OR expires_at > now()))::int AS active
       FROM users c WHERE c.role='client' ${isAdmin ? '' : 'AND c.parent_id = $1'}`,
      params
    );
    res.json({
      credits: isAdmin ? null : req.user.credits,
      unlimited: isAdmin,
      clients: counts.total,
      clientsActive: counts.active,
    });
  })
);

router.get(
  '/reseller/clients',
  requireRole('reseller', 'admin'),
  h(async (req, res) => {
    const isAdmin = req.user.role === 'admin';
    const rows = isAdmin
      ? await many("SELECT * FROM users WHERE role='client' ORDER BY created_at DESC")
      : await many("SELECT * FROM users WHERE role='client' AND parent_id=$1 ORDER BY created_at DESC", [req.user.id]);
    res.json(rows.map(publicUser));
  })
);

// Crea un cliente consumiendo créditos del paquete elegido.
router.post(
  '/reseller/clients',
  requireRole('reseller', 'admin'),
  h(async (req, res) => {
    const { username, password, packageId } = req.body || {};
    if (!username || !password || !packageId) throw httpError(400, 'Datos incompletos');
    const pkg = await one('SELECT * FROM packages WHERE id=$1 AND active', [packageId]);
    if (!pkg) throw httpError(400, 'Paquete inválido');
    const { salt, hash } = hashPassword(password);
    const isReseller = req.user.role === 'reseller';

    const row = await tx(async (c) => {
      if (isReseller) {
        const r = await c.query('SELECT credits FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
        if (r.rows[0].credits < pkg.credits) throw httpError(402, 'Créditos insuficientes');
        await c.query('UPDATE users SET credits = credits - $1 WHERE id=$2', [pkg.credits, req.user.id]);
      }
      let created;
      try {
        created = (
          await c.query(
            `INSERT INTO users (username, pass_hash, pass_salt, role, parent_id, expires_at, max_connections, package_name, created_by)
             VALUES ($1,$2,$3,'client',$4, now() + ($5 || ' days')::interval, $6, $7, $8) RETURNING *`,
            [username, hash, salt, req.user.id, pkg.duration_days, pkg.max_connections, pkg.name, req.user.id]
          )
        ).rows[0];
      } catch (e) {
        if (e.code === '23505') throw httpError(409, 'Ese usuario ya existe');
        throw e;
      }
      await c.query(
        `INSERT INTO transactions (type, amount, reseller_id, by_user_id, client_id, note)
         VALUES ('spend',$1,$2,$3,$4,$5)`,
        [pkg.credits, isReseller ? req.user.id : null, req.user.id, created.id, `Alta ${username} (${pkg.name})`]
      );
      return created;
    });
    res.status(201).json(publicUser(row));
  })
);

// Renueva/extiende la suscripción de un cliente con un paquete.
router.post(
  '/reseller/clients/:id/renew',
  requireRole('reseller', 'admin'),
  h(async (req, res) => {
    const { packageId } = req.body || {};
    const pkg = await one('SELECT * FROM packages WHERE id=$1 AND active', [packageId]);
    if (!pkg) throw httpError(400, 'Paquete inválido');
    const isReseller = req.user.role === 'reseller';

    const row = await tx(async (c) => {
      const cli = (
        await c.query(
          `SELECT * FROM users WHERE id=$1 AND role='client' ${isReseller ? 'AND parent_id=$2' : ''} FOR UPDATE`,
          isReseller ? [req.params.id, req.user.id] : [req.params.id]
        )
      ).rows[0];
      if (!cli) throw httpError(404, 'Cliente no encontrado');
      if (isReseller) {
        const r = await c.query('SELECT credits FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
        if (r.rows[0].credits < pkg.credits) throw httpError(402, 'Créditos insuficientes');
        await c.query('UPDATE users SET credits = credits - $1 WHERE id=$2', [pkg.credits, req.user.id]);
      }
      // Extiende desde la fecha mayor entre ahora y el vencimiento actual.
      const upd = await c.query(
        `UPDATE users SET
            expires_at = GREATEST(COALESCE(expires_at, now()), now()) + ($1 || ' days')::interval,
            max_connections = $2, package_name = $3, status = 'active'
         WHERE id=$4 RETURNING *`,
        [pkg.duration_days, pkg.max_connections, pkg.name, req.params.id]
      );
      await c.query(
        `INSERT INTO transactions (type, amount, reseller_id, by_user_id, client_id, note)
         VALUES ('spend',$1,$2,$3,$4,$5)`,
        [pkg.credits, isReseller ? req.user.id : null, req.user.id, req.params.id, `Renovación (${pkg.name})`]
      );
      return upd.rows[0];
    });
    res.json(publicUser(row));
  })
);

router.patch(
  '/reseller/clients/:id',
  requireRole('reseller', 'admin'),
  h(async (req, res) => {
    const { status } = req.body || {};
    if (!['active', 'disabled'].includes(status)) throw httpError(400, 'Estado inválido');
    const isReseller = req.user.role === 'reseller';
    const row = await one(
      `UPDATE users SET status=$1 WHERE id=$2 AND role='client' ${isReseller ? 'AND parent_id=$3' : ''} RETURNING *`,
      isReseller ? [status, req.params.id, req.user.id] : [status, req.params.id]
    );
    if (!row) throw httpError(404, 'Cliente no encontrado');
    res.json(publicUser(row));
  })
);

router.get(
  '/reseller/transactions',
  requireRole('reseller', 'admin'),
  h(async (req, res) => {
    const isAdmin = req.user.role === 'admin';
    const rows = isAdmin
      ? await many('SELECT * FROM transactions ORDER BY at DESC LIMIT 100')
      : await many('SELECT * FROM transactions WHERE reseller_id=$1 OR by_user_id=$1 ORDER BY at DESC LIMIT 100', [req.user.id]);
    res.json(rows);
  })
);

// ================= SUB-VENDEDORES =================
// Un vendedor puede crear otros vendedores y venderles (transferirles) saldo.
router.get(
  '/reseller/subresellers',
  requireRole('reseller'),
  h(async (req, res) => {
    const rows = await many(
      `SELECT u.*, (SELECT count(*)::int FROM users c WHERE c.parent_id = u.id AND c.role='client') AS client_count
       FROM users u WHERE u.role='reseller' AND u.parent_id=$1 ORDER BY u.created_at DESC`,
      [req.user.id]
    );
    res.json(rows.map((r) => ({ ...publicUser(r), clientCount: r.client_count })));
  })
);

router.post(
  '/reseller/subresellers',
  requireRole('reseller'),
  h(async (req, res) => {
    const { username, password } = req.body || {};
    const credits = Math.max(0, parseInt(req.body?.credits, 10) || 0);
    if (!username || !password) throw httpError(400, 'Usuario y contraseña requeridos');
    const { salt, hash } = hashPassword(password);
    const row = await tx(async (c) => {
      const me = await c.query('SELECT credits FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
      if (credits > 0 && me.rows[0].credits < credits) throw httpError(402, 'Créditos insuficientes');
      let created;
      try {
        created = (
          await c.query(
            `INSERT INTO users (username, pass_hash, pass_salt, role, parent_id, created_by, credits)
             VALUES ($1,$2,$3,'reseller',$4,$4,$5) RETURNING *`,
            [username, hash, salt, req.user.id, credits]
          )
        ).rows[0];
      } catch (e) {
        if (e.code === '23505') throw httpError(409, 'Ese usuario ya existe');
        throw e;
      }
      if (credits > 0) {
        await c.query('UPDATE users SET credits = credits - $1 WHERE id=$2', [credits, req.user.id]);
        await c.query(
          `INSERT INTO transactions (type, amount, reseller_id, by_user_id, note)
           VALUES ('allocate',$1,$2,$3,$4)`,
          [credits, created.id, req.user.id, `Alta sub-vendedor ${username}`]
        );
      }
      return created;
    });
    res.status(201).json(publicUser(row));
  })
);

router.post(
  '/reseller/subresellers/:id/credits',
  requireRole('reseller'),
  h(async (req, res) => {
    const amount = parseInt(req.body?.amount, 10);
    if (!amount) throw httpError(400, 'Monto inválido');
    const updated = await tx(async (c) => {
      const sub = await c.query(
        "SELECT * FROM users WHERE id=$1 AND role='reseller' AND parent_id=$2 FOR UPDATE",
        [req.params.id, req.user.id]
      );
      if (!sub.rows[0]) throw httpError(404, 'Sub-vendedor no encontrado');
      const me = await c.query('SELECT credits FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
      if (amount > 0 && me.rows[0].credits < amount) throw httpError(402, 'Créditos insuficientes');
      if (amount < 0 && sub.rows[0].credits + amount < 0) throw httpError(400, 'El sub-vendedor no tiene tanto saldo para devolver');
      await c.query('UPDATE users SET credits = credits - $1 WHERE id=$2', [amount, req.user.id]);
      const upd = await c.query('UPDATE users SET credits = credits + $1 WHERE id=$2 RETURNING *', [amount, req.params.id]);
      await c.query(
        `INSERT INTO transactions (type, amount, reseller_id, by_user_id, note) VALUES ($1,$2,$3,$4,$5)`,
        [amount >= 0 ? 'allocate' : 'refund', Math.abs(amount), req.params.id, req.user.id,
         amount >= 0 ? 'Venta de saldo a sub-vendedor' : 'Saldo recuperado de sub-vendedor']
      );
      return upd.rows[0];
    });
    res.json(publicUser(updated));
  })
);

// ================= SOLICITUDES DE SALDO / ALTA DISTRIBUIDOR =================
// Un distribuidor pide saldo (kind='credits') a su padre o al admin; un cliente
// pide convertirse en distribuidor (kind='upgrade') al admin. El pago se hace
// por transferencia (fuera del sistema). Al APROBAR se asigna el saldo y, si es
// upgrade, se cambia el rol a 'reseller'.

function requestDTO(r) {
  return {
    id: r.id, kind: r.kind, amount: r.amount, status: r.status, note: r.note || null,
    createdAt: r.created_at, resolvedAt: r.resolved_at || null,
    requesterId: r.requester_id, requester: r.requester_username || null,
    targetId: r.target_id, target: r.target_username || null,
  };
}

// Id del super admin (a quién van las solicitudes de nivel superior).
async function adminId() {
  const a = await one("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
  return a?.id || null;
}

router.post(
  '/credit-requests',
  requireAuth,
  h(async (req, res) => {
    const kind = req.body?.kind === 'upgrade' ? 'upgrade' : 'credits';
    const amount = Math.max(0, parseInt(req.body?.amount, 10) || 0);
    const note = req.body?.note ? String(req.body.note).slice(0, 300) : null;

    if (kind === 'credits') {
      if (req.user.role !== 'reseller') throw httpError(403, 'Solo un distribuidor puede pedir saldo');
      if (amount <= 0) throw httpError(400, 'Indicá la cantidad de saldo');
    } else {
      if (req.user.role !== 'client') throw httpError(400, 'Tu cuenta ya es distribuidor o admin');
    }

    // Destino: upgrade siempre al admin; saldo al padre, o al admin si no tiene.
    const target = kind === 'upgrade' ? await adminId() : (req.user.parent_id || await adminId());

    // Evita duplicados: una sola solicitud pendiente del mismo tipo por usuario.
    const dup = await one(
      "SELECT id FROM credit_requests WHERE requester_id=$1 AND kind=$2 AND status='pending'",
      [req.user.id, kind]
    );
    if (dup) throw httpError(409, 'Ya tenés una solicitud pendiente de este tipo');

    const row = await one(
      `INSERT INTO credit_requests (requester_id, target_id, kind, amount, note)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, target, kind, amount, note]
    );
    res.status(201).json(requestDTO(row));
  })
);

// Mis solicitudes (las que yo envié).
router.get(
  '/credit-requests/mine',
  requireAuth,
  h(async (req, res) => {
    const rows = await many(
      `SELECT cr.*, t.username AS target_username
       FROM credit_requests cr LEFT JOIN users t ON t.id = cr.target_id
       WHERE cr.requester_id=$1 ORDER BY cr.created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(rows.map(requestDTO));
  })
);

// Solicitudes dirigidas a MÍ (distribuidor: de sus sub-vendedores/clientes).
router.get(
  '/reseller/credit-requests',
  requireRole('reseller'),
  h(async (req, res) => {
    const status = req.query.status || null;
    const rows = await many(
      `SELECT cr.*, u.username AS requester_username
       FROM credit_requests cr JOIN users u ON u.id = cr.requester_id
       WHERE cr.target_id=$1 ${status ? 'AND cr.status=$2' : ''}
       ORDER BY cr.created_at DESC LIMIT 100`,
      status ? [req.user.id, status] : [req.user.id]
    );
    res.json(rows.map(requestDTO));
  })
);

// Todas las solicitudes (admin): saldo y upgrades.
router.get(
  '/admin/credit-requests',
  requireRole('admin'),
  h(async (req, res) => {
    const status = req.query.status || null;
    const rows = await many(
      `SELECT cr.*, u.username AS requester_username, t.username AS target_username
       FROM credit_requests cr
       JOIN users u ON u.id = cr.requester_id
       LEFT JOIN users t ON t.id = cr.target_id
       ${status ? 'WHERE cr.status=$1' : ''}
       ORDER BY cr.created_at DESC LIMIT 200`,
      status ? [status] : []
    );
    res.json(rows.map(requestDTO));
  })
);

// Aprobar: asigna saldo (y rol si es upgrade). El aprobador debe ser el admin o
// el destinatario de la solicitud. Un distribuidor-aprobador gasta su saldo.
router.post(
  '/credit-requests/:id/approve',
  requireRole('reseller', 'admin'),
  h(async (req, res) => {
    const out = await tx(async (c) => {
      const cr = (await c.query('SELECT * FROM credit_requests WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!cr) throw httpError(404, 'Solicitud no encontrada');
      if (cr.status !== 'pending') throw httpError(409, 'La solicitud ya fue resuelta');
      const isAdmin = req.user.role === 'admin';
      if (!isAdmin && cr.target_id !== req.user.id) throw httpError(403, 'No es tu solicitud para aprobar');

      // Si el aprobador es distribuidor, descuenta de SU saldo lo que asigna.
      if (!isAdmin && cr.amount > 0) {
        const me = await c.query('SELECT credits FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
        if (me.rows[0].credits < cr.amount) throw httpError(402, 'No tenés saldo suficiente para aprobar');
        await c.query('UPDATE users SET credits = credits - $1 WHERE id=$2', [cr.amount, req.user.id]);
      }

      // Aplica el efecto sobre el solicitante.
      if (cr.kind === 'upgrade') {
        await c.query(
          "UPDATE users SET role='reseller', credits = credits + $1, expires_at=NULL WHERE id=$2",
          [cr.amount, cr.requester_id]
        );
      } else {
        await c.query('UPDATE users SET credits = credits + $1 WHERE id=$2', [cr.amount, cr.requester_id]);
      }

      if (cr.amount > 0) {
        await c.query(
          `INSERT INTO transactions (type, amount, reseller_id, by_user_id, note)
           VALUES ('allocate',$1,$2,$3,$4)`,
          [cr.amount, cr.requester_id, req.user.id,
           cr.kind === 'upgrade' ? 'Alta como distribuidor (saldo inicial)' : 'Saldo aprobado por solicitud']
        );
      }
      const upd = (await c.query(
        "UPDATE credit_requests SET status='approved', resolved_at=now(), resolved_by=$1 WHERE id=$2 RETURNING *",
        [req.user.id, req.params.id]
      )).rows[0];
      return upd;
    });
    res.json(requestDTO(out));
  })
);

router.post(
  '/credit-requests/:id/reject',
  requireRole('reseller', 'admin'),
  h(async (req, res) => {
    const cr = await one('SELECT * FROM credit_requests WHERE id=$1', [req.params.id]);
    if (!cr) throw httpError(404, 'Solicitud no encontrada');
    if (cr.status !== 'pending') throw httpError(409, 'La solicitud ya fue resuelta');
    if (req.user.role !== 'admin' && cr.target_id !== req.user.id) throw httpError(403, 'No es tu solicitud');
    const upd = await one(
      "UPDATE credit_requests SET status='rejected', resolved_at=now(), resolved_by=$1 WHERE id=$2 RETURNING *",
      [req.user.id, req.params.id]
    );
    res.json(requestDTO(upd));
  })
);

export default router;
