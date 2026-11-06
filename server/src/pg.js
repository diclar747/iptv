// Conexión a PostgreSQL: pool, helpers de consulta y transacciones.
// Config por variables de entorno con valores por defecto (desarrollo local).

import pg from 'pg';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || 'iptv',
        user: process.env.PGUSER || 'iptv',
        password: process.env.PGPASSWORD || 'iptv',
        max: 10,
      }
);

pool.on('error', (err) => console.error('[pg] error en cliente inactivo:', err.message));

export function query(text, params) {
  return pool.query(text, params);
}

export async function one(text, params) {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
}

export async function many(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}

// Ejecuta fn dentro de una transacción (recibe un cliente dedicado).
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Crea las tablas si no existen.
export async function initSchema() {
  const sql = readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf8');
  await pool.query(sql);
  await pool.query(readFileSync(path.resolve(__dirname, '../db/affiliates.sql'),'utf8'));
}

export async function ping() {
  await pool.query('SELECT 1');
}
