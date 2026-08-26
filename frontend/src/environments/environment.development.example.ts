/**
 * Plantilla de `environment.development.ts`, que está en .gitignore.
 *
 * No hace falta copiar este archivo a mano: `npm start` ejecuta `sync-env`, que lo
 * genera a partir de GOOGLE_CLIENT_ID del `.env` de la raíz. Está versionado para
 * documentar la forma del archivo y para poder escribirlo a mano si se prefiere.
 */
export const environment = {
  production: false,
  googleClientId: '123456789012-ejemplo.apps.googleusercontent.com',
} as const;
