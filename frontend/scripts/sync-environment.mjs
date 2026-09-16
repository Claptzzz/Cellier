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
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
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

/**
 * Huella del arbol de fuentes. No es decoracion: el arnes la usa como prueba de vida.
 *
 * El servidor de desarrollo se queda sirviendo la ultima compilacion buena cuando una
 * posterior falla, sin decirlo. Ha pasado tres veces, y una de ellas costo una hora
 * revisando capturas de un arreglo que si funcionaba. Con esta huella, el arnes vuelve a
 * generar el fichero de entorno antes de capturar: si el servidor puede recompilar, la
 * pagina acaba anunciando la misma huella que hay en disco; si no puede, no coinciden y
 * el arnes falla en voz alta en vez de fotografiar codigo viejo.
 *
 * Se excluyen los propios ficheros generados: su contenido depende de esta huella.
 */
function sourceHash() {
  const raiz = join(FRONTEND, 'src');
  const hash = createHash('sha256');
  const visitar = (dir) => {
    for (const nombre of readdirSync(dir).sort()) {
      const ruta = join(dir, nombre);
      const rel = relative(raiz, ruta);
      if (rel.startsWith('environments')) continue;
      const st = statSync(ruta);
      if (st.isDirectory()) visitar(ruta);
      else hash.update(rel).update(readFileSync(ruta));
    }
  };
  visitar(raiz);
  return hash.digest('hex').slice(0, 12);
}

const buildStamp = sourceHash();

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
  buildStamp: ${JSON.stringify(buildStamp)},
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
