/**
 * Configuración base. Este archivo SÍ se versiona, y por eso `googleClientId` va
 * vacío: un valor con pinta de real se copia a producción y nadie se entera hasta
 * que el login devuelve 401.
 *
 * Los valores reales viven en `environment.development.ts` y `environment.prod.ts`,
 * que están en .gitignore y los genera `npm run sync-env` a partir del `.env` de la
 * raíz del repositorio. Ese `.env` es la única fuente: el backend lee de ahí su
 * GOOGLE_CLIENT_ID, así que backend y frontend no pueden divergir.
 */
export const environment = {
  production: false,
  googleClientId: '',
} as const;
