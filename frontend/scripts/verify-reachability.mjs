/**
 * ¿Se puede llegar a cada pantalla navegando, o solo escribiendo la URL?
 *
 *   node scripts/verify-reachability.mjs [http://localhost:4200]
 *
 * Recorre la aplicacion desde la raiz pulsando enlaces y botones visibles y anota a donde
 * lleva cada uno. Una ruta declarada en la configuracion que nunca aparezca como destino
 * es una pantalla huerfana: alcanzable escribiendo la direccion, invisible para quien usa
 * la aplicacion.
 *
 * No pulsa acciones destructivas ni irreversibles.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:4300';
const HID = '8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98';
const OTRO = 'b41d0f77-6c58-4e92-8a03-5fd91c2e7a64';

const NO_PULSAR =
  /expulsar|salir del hogar|generar|rechazar|aceptar|eliminar|retirar|quitar admin|hacer admin|compartir|copiar|cerrar sesi/i;

const PANTALLAS = [
  { nombre: 'despensa',            patron: /^\/h\/[^/]+\/pantry$/ },
  { nombre: 'plantillas',          patron: /^\/h\/[^/]+\/templates$/ },
  { nombre: 'recetas',             patron: /^\/h\/[^/]+\/recipes$/ },
  { nombre: 'hogar',               patron: /^\/h\/[^/]+\/home$/ },
  { nombre: 'administrar hogar',   patron: /^\/h\/[^/]+\/manage$/ },
  { nombre: 'ajustes',             patron: /^\/settings$/ },
  { nombre: 'bienvenida',          patron: /^\/onboarding$/ },
  { nombre: 'solicitudes propias', patron: /^\/onboarding\/pending$/ },
];

const PERFIL = {
  id: 'u0', email: 'ana.rivas@gmail.com', displayName: 'Ana Rivas', avatarUrl: null,
  locale: 'es-CL', themePreference: 'SYSTEM', createdAt: '2026-08-24T20:15:30Z',
  households: [
    { id: HID, name: 'Casa Rivas', role: 'ADMIN', memberCount: 3 },
    { id: OTRO, name: 'Depa Ñuñoa', role: 'MEMBER', memberCount: 2 },
  ],
};
const MIEMBROS = [
  { userId: 'u0', displayName: 'Ana Rivas', email: 'ana.rivas@gmail.com', avatarUrl: null,
    role: 'ADMIN', joinedAt: '2026-08-24T20:15:30Z' },
  { userId: 'u1', displayName: 'Camila Soto', email: 'camila@example.com', avatarUrl: null,
    role: 'MEMBER', joinedAt: '2026-09-01T10:00:00Z' },
];
const SOLICITUDES = [
  { id: 'r1', userId: 'u9', displayName: 'Diego Paz', email: 'diego@example.com', avatarUrl: null,
    status: 'PENDING', requestedAt: '2026-09-06T09:15:02Z', resolvedAt: null, resolvedByUserId: null },
];
const MIAS = [
  { id: 's1', householdId: OTRO, householdName: 'Depa Ñuñoa', status: 'PENDING',
    requestedAt: '2026-09-06T09:15:02Z', resolvedAt: null },
];

const json = (body) => (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const browser = await chromium.launch();

async function nuevoContexto(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.route('**/api/**', json([]));
  await page.route('**/api/v1/me', json(PERFIL));
  await page.route('**/members', json(MIEMBROS));
  await page.route('**/join-requests/mine', json(MIAS));
  await page.route('**/households/*/join-requests**', json(SOLICITUDES));
  await page.route(`**/households/${HID}`, json({
    id: HID, name: 'Casa Rivas', joinCode: 'K7M2QP9X', role: 'ADMIN',
    memberCount: 3, createdAt: '2026-09-01T10:00:00Z',
  }));
  await page.addInitScript(() => localStorage.setItem('cellier.refreshToken', 't'));
  return { context, page };
}

const controles = (page) =>
  page.evaluate(() => {
    const nombre = (el) =>
      (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ');
    return [...document.querySelectorAll('a[href], button')]
      .filter((el) => el.checkVisibility() && !el.hasAttribute('disabled'))
      .map((el) => ({ nombre: nombre(el), rol: el.tagName === 'A' ? 'link' : 'button' }))
      .filter((c) => c.nombre.length > 0 && c.nombre.length < 80);
  });

async function pulsar(page, control) {
  const loc = page.getByRole(control.rol, { name: control.nombre, exact: true })
    .filter({ visible: true });
  if ((await loc.count()) === 0) return false;
  try {
    await loc.first().click({ timeout: 2500 });
    await page.waitForTimeout(450);
    return true;
  } catch {
    return false;
  }
}

async function recorrer(width) {
  const visitadas = new Set();
  const alcanzadas = new Set();
  const aristas = [];
  const cola = ['/'];
  const { context, page } = await nuevoContexto(width);

  while (cola.length) {
    const desde = cola.shift();
    if (visitadas.has(desde)) continue;
    visitadas.add(desde);

    await page.goto(BASE + desde, { waitUntil: 'commit' });
    await page.waitForTimeout(800);
    const origen = new URL(page.url()).pathname;
    alcanzadas.add(origen);
    const lista = (await controles(page)).filter((c) => !NO_PULSAR.test(c.nombre));

    for (const control of lista) {
      await page.goto(BASE + desde, { waitUntil: 'commit' });
      await page.waitForTimeout(600);
      if (!(await pulsar(page, control))) continue;

      let destino = new URL(page.url()).pathname;
      if (destino === origen) {
        // No navego: pudo abrir un panel. Se mira que ofrece dentro.
        const dentro = (await controles(page))
          .filter((c) => !NO_PULSAR.test(c.nombre) && c.nombre !== control.nombre);
        for (const hijo of dentro) {
          if (!(await pulsar(page, hijo))) continue;
          const p2 = new URL(page.url()).pathname;
          if (p2 !== origen) {
            alcanzadas.add(p2);
            aristas.push(`${origen} --[${control.nombre} › ${hijo.nombre}]--> ${p2}`);
            if (!visitadas.has(p2)) cola.push(p2);
            break;
          }
        }
        continue;
      }

      alcanzadas.add(destino);
      aristas.push(`${origen} --[${control.nombre}]--> ${destino}`);
      if (!visitadas.has(destino)) cola.push(destino);
    }
  }

  await context.close();
  return { alcanzadas, aristas };
}

let huerfanas = 0;
for (const width of [375, 1440]) {
  const { alcanzadas, aristas } = await recorrer(width);
  console.log(`\n=== ${width}px ===`);
  aristas.forEach((a) => console.log(`  ${a}`));
  console.log('');
  for (const pantalla of PANTALLAS) {
    const ok = [...alcanzadas].some((u) => pantalla.patron.test(u));
    if (!ok) huerfanas++;
    console.log(`  ${ok ? 'OK      ' : 'HUERFANA'} ${pantalla.nombre}`);
  }
}

await browser.close();
console.log(huerfanas === 0
  ? '\nToda pantalla tiene al menos un camino de navegacion.'
  : `\n${huerfanas} pantalla(s) huerfana(s).`);
process.exit(huerfanas === 0 ? 0 : 1);
