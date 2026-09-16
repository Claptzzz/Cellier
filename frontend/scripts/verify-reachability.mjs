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

// Acciones que NO se pulsan porque son destructivas o irreversibles. El patron tiene que ser
// preciso: `generar` a secas tambien casaba con "Generar reporte", que solo lee, y el
// recorrido se negaba a seguir ese camino sin decirlo. Un patron ancho aqui es la misma clase
// de omision silenciosa que un control que no se encuentra.
const NO_PULSAR =
  /expulsar|salir del hogar|generar un c\u00f3digo|rechazar|aceptar|eliminar|retirar|quitar admin|hacer admin|compartir|copiar|cerrar sesi/i;

/** Lo que se decidio no pulsar, para que la decision se vea en el informe. */
const omitidos = new Set();

const PANTALLAS = [
  { nombre: 'despensa',            patron: /^\/h\/[^/]+\/pantry$/ },
  { nombre: 'plantillas',          patron: /^\/h\/[^/]+\/templates$/ },
  { nombre: 'editor de plantilla', patron: /^\/h\/[^/]+\/templates\/[^/]+$/ },
  { nombre: 'reporte de compras',  patron: /^\/h\/[^/]+\/templates\/[^/]+\/report$/ },
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
/** Una plantilla para que la lista tenga fila que pulsar y el editor deje de ser inalcanzable. */
const PLANTILLAS = [
  { id: 'tpl1', name: 'Compra semanal', itemCount: 2, createdByName: 'Ana Rivas',
    createdAt: '2026-08-24T15:00:00Z', updatedAt: '2026-09-02T11:20:00Z' },
];
const PLANTILLA = {
  id: 'tpl1', name: 'Compra semanal', createdByName: 'Ana Rivas',
  createdAt: '2026-08-24T15:00:00Z', updatedAt: '2026-09-02T11:20:00Z',
  items: [
    { id: 'i1', productId: 'p1', productName: 'Huevos', unit: 'UNIT', category: 'Frescos',
      desiredQuantity: 10 },
  ],
};

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
  await page.route('**/api/v1/households/*/members', json(MIEMBROS));
  await page.route('**/api/v1/join-requests/mine', json(MIAS));
  await page.route('**/api/v1/households/*/join-requests**', json(SOLICITUDES));
  await page.route('**/api/v1/households/*/templates', json(PLANTILLAS));
  await page.route('**/api/v1/households/*/templates/*', json(PLANTILLA));
  await page.route('**/api/v1/households/*/templates/*/report', json({
    templateId: 'tpl1', templateName: 'Compra semanal', generatedAt: '2026-09-15T14:30:00Z',
    summary: { totalItems: 1, missingItems: 1, completionRate: 0 },
    items: [{ productId: 'p1', productName: 'Huevos', unit: 'UNIT', category: 'Frescos',
      desiredQuantity: 10, availableQuantity: 4, missingQuantity: 6, status: 'MISSING' }],
  }));
  await page.route(`**/api/v1/households/${HID}`, json({
    id: HID, name: 'Casa Rivas', joinCode: 'K7M2QP9X', role: 'ADMIN',
    memberCount: 3, createdAt: '2026-09-01T10:00:00Z',
  }));
  await page.addInitScript(() => localStorage.setItem('cellier.refreshToken', 't'));
  return { context, page };
}

/**
 * Los controles visibles, con el nombre CON EL QUE LUEGO SE BUSCAN.
 *
 * <p>Se usa `innerText` y no `textContent`. No es un detalle: `textContent` concatena sin
 * separador, asi que un enlace con dos <span> pegados da "Compra semanal2 productos",
 * mientras que el nombre accesible que usa `getByRole` dice "Compra semanal 2 productos".
 * La busqueda exacta no encontraba nada, el recorrido se saltaba ese control EN SILENCIO,
 * y la pantalla a la que llevaba salia declarada huerfana teniendo camino. `innerText` mide
 * el texto renderizado, que es de donde sale el nombre accesible.
 */
const controles = (page) =>
  page.evaluate(() => {
    const nombre = (el) =>
      (el.getAttribute('aria-label') || el.innerText || el.textContent || '')
        .trim().replace(/\s+/g, ' ');
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
    const todos = await controles(page);
    todos.filter((c) => NO_PULSAR.test(c.nombre)).forEach((c) => omitidos.add(c.nombre));
    const lista = todos.filter((c) => !NO_PULSAR.test(c.nombre));
    // A stderr: el informe va a stdout y se lee entero al final, pero un recorrido que
    // tarda de mas hay que poder mirarlo mientras corre para saber donde se atasca.
    process.stderr.write(`  [${width}px] ${origen}: ${lista.length} controles\n`);

    for (const control of lista) {
      await page.goto(BASE + desde, { waitUntil: 'commit' });
      await page.waitForTimeout(600);
      if (!(await pulsar(page, control))) continue;

      let destino = new URL(page.url()).pathname;
      if (destino === origen) {
        // No navego: pudo abrir un panel. Se mira TODO lo que ofrece dentro.
        //
        // Cada hijo se prueba desde cero —volver a la pantalla, volver a abrir el panel—
        // porque pulsar uno cierra el panel o se lleva la navegacion. Y no se corta al
        // primero que navega: un panel con varios destinos aporta varios caminos, y parando
        // en el primero los demas quedaban sin explorar. Eso hacia que /onboarding saliera
        // alcanzable solo por accidente, cuando el hijo que llevaba a el era el unico que el
        // recorrido conseguia pulsar.
        const dentro = (await controles(page))
          .filter((c) => !NO_PULSAR.test(c.nombre) && c.nombre !== control.nombre);

        for (const hijo of dentro) {
          await page.goto(BASE + desde, { waitUntil: 'commit' });
          await page.waitForTimeout(600);
          if (!(await pulsar(page, control))) continue;
          if (!(await pulsar(page, hijo))) continue;

          const p2 = new URL(page.url()).pathname;
          if (p2 !== origen) {
            alcanzadas.add(p2);
            aristas.push(`${origen} --[${control.nombre} › ${hijo.nombre}]--> ${p2}`);
            if (!visitadas.has(p2)) cola.push(p2);
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

// Las omisiones deliberadas se enseñan: si aparece aqui algo que si deberia pulsarse, el
// patron de NO_PULSAR esta de mas y se ve sin tener que sospecharlo.
if (omitidos.size) {
  console.log('\nNo se pulsaron, por destructivos o irreversibles:');
  [...omitidos].sort().forEach((n) => console.log(`  - ${n}`));
}

console.log(huerfanas === 0
  ? '\nToda pantalla tiene al menos un camino de navegacion.'
  : `\n${huerfanas} pantalla(s) huerfana(s).`);
process.exit(huerfanas === 0 ? 0 : 1);
