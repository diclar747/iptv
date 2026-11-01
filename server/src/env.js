// Carga las variables desde el archivo .env del raíz del proyecto (si existe)
// ANTES de que cualquier otro módulo lea process.env. Se importa primero en
// index.js. Sin dependencias externas: usa el soporte nativo de Node (>=20.6).
//
// En el servidor (VPS), copiá .env.example como .env y completá las claves;
// `npm start` las tomará solo. Si no hay .env, se usan las variables del
// sistema o los valores por defecto.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
try {
  process.loadEnvFile(path.join(root, '.env'));
  console.log('[env] variables cargadas desde .env');
} catch {
  // No hay .env (o Node no soporta loadEnvFile): no es un error.
}
