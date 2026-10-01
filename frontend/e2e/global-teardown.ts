import { execSync } from 'node:child_process';
import path from 'node:path';

const COMPOSE_FILE = path.resolve(__dirname, '..', '..', 'docker-compose.e2e.yml');

/**
 * Apaga el Postgres efímero y se lleva su volumen (`down -v`): la próxima corrida arranca
 * de un esquema vacío de verdad, no de lo que haya quedado de ésta.
 *
 * No deja que un fallo aquí tumbe el reporte de Playwright: si `docker compose down` no
 * puede correr (por ejemplo porque alguien ya paró el contenedor a mano), se avisa por
 * consola y se sigue, en vez de enmascarar el resultado real de los tests con un error de
 * limpieza.
 */
export default async function globalTeardown(): Promise<void> {
  console.log('[e2e] Deteniendo Postgres efímero…');
  try {
    execSync(`docker compose -f "${COMPOSE_FILE}" down -v`, { stdio: 'inherit' });
  } catch (error) {
    console.error('[e2e] No se pudo detener docker-compose.e2e.yml limpiamente:', error);
  }
}
