/**
 * Genera src/environments/environment.development.ts (y con --prod también
 * environment.prod.ts) tomando GOOGLE_CLIENT_ID de una única fuente.
 *
 * Orden de búsqueda:
 *   1. la variable de entorno GOOGLE_CLIENT_ID  (CI, pipeline de despliegue)
 *   2. el archivo .env de la raíz del repositorio  (desarrollo local)
 *
 * Ese mismo .env es el que lee el backend, así que el client id que exige como
 * `aud` del ID token y el que usa el frontend al inicializar Google Identity
 * Services son por construcción el mismo. Antes vivían en dos archivos distintos
 * y nada impedía que divergieran.
 *
 *   node scripts/sync-environment.mjs [--prod]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, '..');
const REPO_ROOT = join(FRONTEND, '..');
const ENV_FILE = join(REPO_ROOT, '.env');

const prod = process.argv.includes('--prod');

/** Lee una clave del .env sin dependencias: formato KEY=valor, # comenta. */
function readFromDotenv(key) {
  if (!existsSync(ENV_FILE)) {
    return null;
  }
  for (const raw of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    if (line.slice(0, eq).trim() !== key) continue;
    // Se quitan comillas envolventes si las hubiera.
    return line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

const fromEnv = process.env.GOOGLE_CLIENT_ID?.trim();
const fromFile = readFromDotenv('GOOGLE_CLIENT_ID');
const clientId = fromEnv || fromFile || '';
const origin = fromEnv ? 'variable de entorno' : fromFile ? '.env de la raíz' : 'ninguna';

const target = prod ? 'environment.prod.ts' : 'environment.development.ts';
const contents = `// GENERADO por scripts/sync-environment.mjs. No editar a mano ni versionar.
// Fuente del client id: ${origin}
export const environment = {
  production: ${prod},
  googleClientId: ${JSON.stringify(clientId)},
} as const;
`;

writeFileSync(join(FRONTEND, 'src', 'environments', target), contents);

if (!clientId) {
  console.warn(
    `\n  sync-env: ${target} generado SIN client id de Google.\n` +
      `  Define GOOGLE_CLIENT_ID en ${ENV_FILE} (o como variable de entorno).\n` +
      `  La aplicación arranca igual, pero /login mostrará un error al intentar entrar.\n`,
  );
} else {
  console.log(`sync-env: ${target} generado desde ${origin}`);
}
