/**
 * Qué ve el usuario cuando el arranque no puede completarse.
 *
 *   node scripts/verify-startup.mjs [http://localhost:4200]
 *
 * El perfil se carga en un app initializer, así que bloquea el primer pintado. Este
 * script comprueba que ningún fallo de esa carga deja la pantalla en blanco sin
 * explicación: backend caído, red que no responde, y sesión caducada.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:4300';
const CASA = '8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98';

const PERFIL = {
  id: 'u1', email: 'ana.rivas@gmail.com', displayName: 'Ana Rivas', avatarUrl: null,
  locale: 'es-CL', themePreference: 'SYSTEM', createdAt: '2026-08-24T20:15:30Z',
  households: [{ id: CASA, name: 'Casa Rivas', role: 'ADMIN', memberCount: 4 }],
};

const json = (body, status = 200) => (r) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const browser = await chromium.launch();

async function arranca({ nombre, rutas, esperaMs = 6000, reintento = false }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // El escenario del reintento: primero el servidor no contesta, y cuando el usuario
  // pulsa el boton ya esta de vuelta.
  let caido = reintento;
  if (reintento) {
    await page.route('**/api/v1/me', (r) =>
      caido ? r.abort('connectionrefused') : json(PERFIL)(r));
  }
  for (const [patron, handler] of rutas) {
    await page.route(patron, handler);
  }
  await page.addInitScript(() => localStorage.setItem('cellier.refreshToken', 'token-de-prueba'));

  const t0 = Date.now();
  await page.goto(BASE + '/', { waitUntil: 'commit' });
  await page.waitForTimeout(esperaMs);

  if (reintento) {
    caido = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await page.waitForTimeout(1500);
  }

  const visible = (await page.locator('body').innerText().catch(() => '')).trim().replace(/\s+/g, ' ');
  const pintado = await page.evaluate(() => {
    const root = document.querySelector('app-root');
    return { hijos: root ? root.children.length : -1, alto: document.body.scrollHeight };
  });
  const url = new URL(page.url()).pathname;
  await context.close();

  return { nombre, ms: Date.now() - t0, url, hijos: pintado.hijos, texto: visible.slice(0, 160) };
}

const casos = [
  {
    nombre: 'A · backend caido (la peticion se rechaza)',
    rutas: [['**/api/v1/**', (r) => r.abort('connectionrefused')]],
    espera: { url: '/reconnect', contiene: 'No pudimos conectar con el servidor' },
  },
  {
    nombre: 'B · el servidor no responde nunca (cuelga)',
    // Nunca se resuelve: es el caso que un catchError no cubre.
    rutas: [['**/api/v1/**', () => {}]],
    esperaMs: 12000,
    espera: { url: '/reconnect', contiene: 'No pudimos conectar con el servidor' },
  },
  {
    nombre: 'C · sesion caducada (me 401 y refresh 401)',
    rutas: [
      ['**/api/v1/me', json({ status: 401, title: 'No autenticado' }, 401)],
      ['**/api/v1/auth/refresh', json({ status: 401, title: 'No autenticado' }, 401)],
    ],
    espera: { url: '/login', contiene: 'Continuar con Google' },
  },
  {
    nombre: 'D2 · el servidor cuelga y luego se reintenta con exito',
    rutas: [],
    esperaMs: 14000,
    reintento: true,
    espera: { url: `/h/${CASA}/pantry`, contiene: 'Casa Rivas' },
  },
  {
    nombre: 'D · el servidor tarda 3 s pero responde',
    rutas: [['**/api/v1/me', async (r) => {
      await new Promise((res) => setTimeout(res, 3000));
      return json(PERFIL)(r);
    }]],
    esperaMs: 8000,
    espera: { url: `/h/${CASA}/pantry`, contiene: 'Casa Rivas' },
  },
];

let fallos = 0;
for (const caso of casos) {
  const r = await arranca(caso);
  const ok = r.url === caso.espera.url && r.texto.includes(caso.espera.contiene);
  if (!ok) fallos++;
  console.log(`\n${ok ? 'OK   ' : 'FALLA'} ${r.nombre}`);
  console.log(`   tras ${(r.ms / 1000).toFixed(1)}s -> url ${r.url} · hijos de <app-root>: ${r.hijos}`);
  console.log(`   pantalla: ${r.texto ? `"${r.texto}"` : '(EN BLANCO)'}`);
  if (!ok) console.log(`   esperaba url ${caso.espera.url} con "${caso.espera.contiene}"`);
}

await browser.close();
console.log(fallos === 0 ? '\nNingun fallo de arranque deja la pantalla en blanco.' : `\n${fallos} caso(s) fallan.`);
process.exit(fallos === 0 ? 0 : 1);
