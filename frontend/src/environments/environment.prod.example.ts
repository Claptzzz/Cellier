/**
 * Plantilla de `environment.prod.ts`, que está en .gitignore.
 *
 * Lo genera `npm run build` mediante `sync-env --prod`, tomando GOOGLE_CLIENT_ID de
 * la variable de entorno o, si no está, del `.env` de la raíz.
 */
export const environment = {
  production: true,
  googleClientId: '123456789012-ejemplo.apps.googleusercontent.com',
  buildStamp: 'ejemplo',
} as const;
