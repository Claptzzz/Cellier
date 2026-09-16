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
  // Huella del arbol de fuentes. La escribe sync-environment.mjs en los archivos
  // generados; el arnes la compara con la del disco para detectar que el servidor de
  // desarrollo esta sirviendo una compilacion vieja.
  buildStamp: 'sin-sello',
} as const;
