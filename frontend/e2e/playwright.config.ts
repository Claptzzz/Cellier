import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// Playwright carga este archivo como CommonJS por defecto (el package.json del frontend
// no declara "type": "module"), así que `__dirname` ya existe como global: nada de
// `import.meta.url`, que revienta fuera de un módulo ES de verdad.
const FRONTEND_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.resolve(__dirname, '..', '..', 'backend');

export const FRONTEND_PORT = 4300;
export const BACKEND_PORT = 8080;
export const BACKEND_BASE_URL = `http://localhost:${BACKEND_PORT}`;

/** Secretos de prueba, fijos y sin valor fuera de esta corrida. Nunca se usan en dev ni prod. */
const E2E_JWT_SECRET = 'cellier-e2e-secret-no-usar-en-produccion-0123456789';
const E2E_GOOGLE_CLIENT_ID = 'cellier-e2e-client-id.apps.googleusercontent.com';

// Windows no busca el directorio actual al resolver un nombre de programa suelto:
// hace falta el prefijo explícito, igual que en POSIX.
const mvnw = process.platform === 'win32' ? '.\\mvnw.cmd' : './mvnw';

export default defineConfig({
  testDir: './tests',

  /**
   * UN SOLO worker, a propósito. Cada archivo de test llama a
   * `POST /api/v1/auth/test/reset` antes de sembrar sus propios datos (ver
   * `support/seed.ts`), y ese endpoint vacía el esquema ENTERO: es la forma más simple y
   * más fiable de que ningún escenario herede estado de otro (el producto que uno
   * consumió hasta 0 no puede ser el mismo que otro está a punto de dar por completo).
   * Con más de un worker, dos archivos compartiendo la misma base efímera se borrarían
   * el trabajo mutuamente a mitad de prueba. Son 7 flujos, no 700: correrlos en serie
   * sale en minutos, no en una espera real.
   */
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never', outputFolder: './playwright-report' }], ['list']],
  // Capturas, trazas y vídeos de los fallos. Relativo a esta carpeta y no al cwd desde
  // donde se invoque `playwright test`, para que siempre caigan bajo `e2e/`.
  outputDir: './test-results',

  /**
   * Nada de `globalSetup` para levantar Postgres: en la práctica, Playwright no espera a
   * que termine antes de arrancar los `webServer` de abajo —el backend intentaba conectar
   * antes de que el contenedor estuviera listo, con el contenedor ya "Healthy" segundos
   * después—. El `up -d --wait` vive en el script `pre-e2e` de `package.json`, que SÍ es
   * estrictamente secuencial porque `&&` encadena procesos completos, no funciones
   * dentro del mismo uno. El apagado sí puede ir aquí: para entonces ya no hay ninguna
   * carrera que perder.
   */
  globalTeardown: './global-teardown.ts',

  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    // Capturas y traza SÓLO cuando algo falla: una corrida sana no deja nada que mirar,
    // y una que falla deja exactamente lo que hace falta para entender por qué.
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-safari',
      // El preset ya trae 390x844: es iPhone 13 real, no un viewport inventado.
      use: { ...devices['iPhone 13'] },
    },
  ],

  /**
   * Backend y frontend, arrancados y apagados por Playwright mismo. Postgres ya está
   * arriba para cuando esto arranca —lo garantiza `pre-e2e` en `package.json`, no nada
   * de aquí dentro—, así que el backend conecta a la primera.
   */
  webServer: [
    {
      command: `${mvnw} spring-boot:run`,
      cwd: BACKEND_DIR,
      url: `${BACKEND_BASE_URL}/actuator/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        SPRING_PROFILES_ACTIVE: 'test',
        DB_HOST: 'localhost',
        DB_PORT: process.env.E2E_DB_PORT ?? '5555',
        DB_NAME: 'cellier_e2e',
        DB_USER: 'cellier',
        DB_PASSWORD: 'cellier',
        JWT_SECRET: E2E_JWT_SECRET,
        GOOGLE_CLIENT_ID: E2E_GOOGLE_CLIENT_ID,
      },
    },
    {
      command: `npm start -- --port ${FRONTEND_PORT}`,
      cwd: FRONTEND_DIR,
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
