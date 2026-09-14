/**
 * Capturas de verificación del shell y del sistema de diseño.
 * Uso: node scripts/shots.mjs http://localhost:4200
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4200';
const OUT = new URL('../../docs/ui-shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = { '375': { width: 375, height: 812 }, '1440': { width: 1440, height: 900 } };
const THEMES = ['light', 'dark'];
// El hogar vive en la URL desde el Incremento 3, asi que las rutas de seccion
// llevan su id. `/pantry` sigue existiendo como redireccion desde las URLs
// antiguas, pero aqui se apunta al destino real para no capturar un rebote.
const HOUSEHOLD_ID = '8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98';

const PAGES = [
  { slug: 'login', path: '/login', auth: false },
  { slug: 'shell-pantry', path: `/h/${HOUSEHOLD_ID}/pantry`, auth: true },
  { slug: 'dev-ui', path: '/dev/ui', auth: true },
];

const PROFILE = {
  id: '3f1c9a2e-5b7d-4a10-9c88-2f0e6b4d1a73',
  email: 'ana.rivas@gmail.com',
  displayName: 'Ana Rivas',
  avatarUrl: null,
  locale: 'es-CL',
  themePreference: 'SYSTEM',
  createdAt: '2026-08-24T20:15:30Z',
  // El perfil trae los hogares del usuario. Sin ellos el guard mandaria a
  // /onboarding y las capturas del chasis saldrian de la pantalla equivocada.
  households: [
    { id: HOUSEHOLD_ID, name: 'Casa Rivas', role: 'ADMIN', memberCount: 4 },
    { id: 'b41d0f77-6c58-4e92-8a03-5fd91c2e7a64', name: 'Depa Ñuñoa', role: 'MEMBER', memberCount: 2 },
  ],
};

const browser = await chromium.launch();
const results = [];

async function makePage(width, height, theme) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  const page = await context.newPage();

  // Nada de red real: el backend se simula y GIS se bloquea para que las
  // capturas sean deterministas.
  // Catch-all primero: una llamada sin simular llega al backend real, tumba la sesion y la
  // captura acaba en /login pareciendo un fallo del producto.
  await page.route('**/api/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/v1/me', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PROFILE) }));
  // GIS se deja pasar: queremos ver el botón real que renderiza Google.

  await page.addInitScript((t) => {
    localStorage.setItem('cellier.theme', t);
  }, theme);

  return { context, page };
}

for (const target of PAGES) {
  for (const [label, vp] of Object.entries(VIEWPORTS)) {
    for (const theme of THEMES) {
      const { context, page } = await makePage(vp.width, vp.height, theme);
      if (target.auth) {
        await page.addInitScript(() => localStorage.setItem('cellier.refreshToken', 'shot-token'));
      }
      await page.goto(BASE + target.path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      const name = `${target.slug}-${label}-${theme}.png`;
      await page.screenshot({ path: OUT + name, fullPage: label === '1440' ? false : true });

      // Comprobación de desbordamiento horizontal en cada combinación.
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      results.push({ name, overflowPx: overflow });
      await context.close();
    }
  }
}

// ---- Zoom al 200% en 375px --------------------------------------------------
// El zoom del navegador al 200% HALVA el viewport CSS: 375px pasan a ~188px.
// Se emula reduciendo el viewport, no con body{zoom:2}, que escala el render y
// arrastra redondeo subpíxel sin reproducir el reflow real.
for (const theme of THEMES) {
  const { context, page } = await makePage(188, 812, theme);
  await page.addInitScript(() => localStorage.setItem('cellier.refreshToken', 'shot-token'));
  await page.goto(BASE + '/dev/ui', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const name = `zoom200-375-${theme}.png`;
  await page.screenshot({ path: OUT + name });
  results.push({ name, overflowPx: overflow, note: 'zoom 200%' });
  await context.close();
}

// ---- Banda de nivel: color, gris y deuteranopía -----------------------------
const DEUTER = `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0">
<filter id="deuter"><feColorMatrix type="matrix" values="
 0.625 0.375 0 0 0
 0.70  0.30  0 0 0
 0     0.30  0.70 0 0
 0 0 0 1 0"/></filter></svg>`;

for (const theme of THEMES) {
  for (const mode of ['color', 'grayscale', 'deuteranopia']) {
    const { context, page } = await makePage(560, 460, theme);
    await page.addInitScript(() => localStorage.setItem('cellier.refreshToken', 'shot-token'));
    await page.goto(BASE + '/dev/ui', { waitUntil: 'networkidle' });

    const section = page.locator('section').filter({ hasText: 'Banda de nivel' }).first();
    await section.scrollIntoViewIfNeeded();

    if (mode !== 'color') {
      await page.evaluate((m) => {
        if (m === 'grayscale') {
          document.body.style.filter = 'grayscale(1)';
        } else {
          const holder = document.createElement('div');
          holder.innerHTML = "<svg xmlns='http://www.w3.org/2000/svg' style='position:absolute;width:0;height:0'><filter id='deuter'><feColorMatrix type='matrix' values='0.625 0.375 0 0 0 0.70 0.30 0 0 0 0 0.30 0.70 0 0 0 0 0 1 0'/></filter></svg>";
          document.body.appendChild(holder);
          document.body.style.filter = 'url(#deuter)';
        }
      }, mode);
    }
    await page.waitForTimeout(300);

    const name = `band-${mode}-${theme}.png`;
    await section.screenshot({ path: OUT + name });
    results.push({ name });
    await context.close();
  }
}

// ---- Holgura del FAB sobre la última fila -----------------------------------
{
  const { context, page } = await makePage(375, 812, 'light');
  await page.addInitScript(() => localStorage.setItem('cellier.refreshToken', 'shot-token'));
  await page.goto(BASE + '/dev/ui', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);

  const geometry = await page.evaluate(() => {
    const fab = document.querySelector('button[aria-label="Añadir artículo"]');
    const nav = document.querySelector('nav[aria-label="Secciones"]');
    const main = document.querySelector('main');
    const last = main?.lastElementChild?.lastElementChild ?? null;
    const box = (el) => (el ? el.getBoundingClientRect() : null);
    const lastContent = main ? main.querySelectorAll('section') : [];
    const tail = lastContent.length ? lastContent[lastContent.length - 1] : null;
    return {
      fab: box(fab),
      nav: box(nav),
      lastSectionBottom: tail ? tail.getBoundingClientRect().bottom : null,
      viewportH: window.innerHeight,
      mainPaddingBottom: main ? getComputedStyle(main).paddingBottom : null,
    };
  });

  await page.screenshot({ path: OUT + 'fab-clearance-375-light.png' });
  results.push({ name: 'fab-clearance-375-light.png', geometry });
  await context.close();
}

// ---- Onboarding: los dos caminos, el codigo recien creado y la sala de espera ----
// Cada pantalla necesita un backend distinto, asi que no encajan en el bucle de PAGES.
const SIN_HOGARES = { ...PROFILE, households: [] };
const CREADO = {
  id: HOUSEHOLD_ID, name: 'Casa Rivas', joinCode: 'K7M2QP9X',
  role: 'ADMIN', memberCount: 1, createdAt: '2026-09-04T09:15:02Z',
};
const MIS_SOLICITUDES = [
  { id: 's1', householdId: HOUSEHOLD_ID, householdName: 'Casa Rivas',
    status: 'PENDING', requestedAt: '2026-09-06T09:15:02Z', resolvedAt: null },
  { id: 's2', householdId: 'b41d0f77-6c58-4e92-8a03-5fd91c2e7a64', householdName: 'Depa \u00d1u\u00f1oa',
    status: 'APPROVED', requestedAt: '2026-09-02T18:40:00Z', resolvedAt: '2026-09-03T08:12:00Z' },
  { id: 's3', householdId: 'c72e1a55-1111-4a22-9b33-4c5d6e7f8090', householdName: 'Casa de la playa',
    status: 'REJECTED', requestedAt: '2026-08-28T20:41:17Z', resolvedAt: '2026-08-29T08:03:55Z' },
];

const json = (body) => (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const ONBOARDING = [
  { slug: 'onboarding', path: '/onboarding', perfil: SIN_HOGARES,
    rutas: [['**/api/v1/join-requests/mine', json([])]] },
  {
    slug: 'onboarding-created', path: '/onboarding', perfil: SIN_HOGARES,
    rutas: [
      ['**/api/v1/join-requests/mine', json([])],
      ['**/api/v1/households', (r) => (r.request().method() === 'POST' ? json(CREADO)(r) : json([])(r))],
    ],
    // El codigo solo aparece despues de crear: hay que crear.
    async interactuar(page) {
      await page.getByLabel('Nombre del hogar').fill('Casa Rivas');
      await page.getByRole('button', { name: 'Crear hogar' }).click();
      await page.getByText('K7M2QP9X').waitFor({ timeout: 5000 });
    },
  },
  {
    // Con navigator.share disponible. Chromium de escritorio NO lo expone, asi que sin
    // este caso la rama de compartir no se veria en ninguna captura.
    slug: 'onboarding-created-share', path: '/onboarding', perfil: SIN_HOGARES,
    conShare: true,
    rutas: [
      ['**/api/v1/join-requests/mine', json([])],
      ['**/api/v1/households', (r) => (r.request().method() === 'POST' ? json(CREADO)(r) : json([])(r))],
    ],
    async interactuar(page) {
      await page.getByLabel('Nombre del hogar').fill('Casa Rivas');
      await page.getByRole('button', { name: 'Crear hogar' }).click();
      await page.getByText('K7M2QP9X').waitFor({ timeout: 5000 });
    },
  },
  { slug: 'onboarding-pending', path: '/onboarding/pending', perfil: SIN_HOGARES,
    rutas: [['**/api/v1/join-requests/mine', json(MIS_SOLICITUDES)]] },
  { slug: 'onboarding-pending-empty', path: '/onboarding/pending', perfil: SIN_HOGARES,
    rutas: [['**/api/v1/join-requests/mine', json([])]] },
  {
    slug: 'onboarding-pending-loading', path: '/onboarding/pending', perfil: SIN_HOGARES,
    // Respuesta que no llega dentro de la ventana de captura: asi se fotografia el
    // esqueleto, que es lo que ve alguien con una conexion lenta.
    rutas: [['**/api/v1/join-requests/mine', () => {}]],
    esperaMs: 900,
  },
];

// ---- Selector de hogar y distintivo de pendientes ----
const CON_PENDIENTES = [
  { id: 'r1', userId: 'u9', displayName: 'Camila Soto', email: 'camila@example.com',
    avatarUrl: null, status: 'PENDING', requestedAt: '2026-09-06T09:15:02Z',
    resolvedAt: null, resolvedByUserId: null },
  { id: 'r2', userId: 'u8', displayName: 'Diego Paz', email: 'diego@example.com',
    avatarUrl: null, status: 'PENDING', requestedAt: '2026-09-05T18:02:00Z',
    resolvedAt: null, resolvedByUserId: null },
];

for (const abierto of [false, true]) {
  for (const [label, vp] of Object.entries(VIEWPORTS)) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        colorScheme: theme,
      });
      const page = await context.newPage();
      // Catch-all primero: una llamada sin simular llega al backend real, tumba la
      // sesion y la captura acaba en /login pareciendo un fallo del producto.
      await page.route('**/api/**', json([]));
      await page.route('**/api/v1/me', json(PROFILE));
      await page.route('**/join-requests**', json(CON_PENDIENTES));
      await page.addInitScript((t) => {
        localStorage.setItem('cellier.theme', t);
        localStorage.setItem('cellier.refreshToken', 'shot-token');
      }, theme);

      await page.goto(`${BASE}/h/${HOUSEHOLD_ID}/pantry`, { waitUntil: 'commit' });
      await page.waitForTimeout(900);
      if (abierto) {
        // El chasis monta DOS selectores (barra lateral y cabecera) y oculta uno por CSS
        // segun el ancho. Se comprueba que solo uno sea visible: si los dos lo fueran,
        // habria dos disparadores del mismo control en la misma pantalla.
        const disparadores = page.getByRole('button', { name: /Hogar activo/ });
        const visibles = await disparadores.evaluateAll(
          (nodos) => nodos.filter((n) => n.checkVisibility()).length);
        if (visibles !== 1) {
          throw new Error(`Se esperaba 1 selector visible en ${label}px, hay ${visibles}`);
        }

        await disparadores.filter({ visible: true }).click();
        await page.waitForTimeout(600);

        // Comprobacion explicita en vez de esperar por un selector: el chasis monta los
        // dos contenedores y solo uno se muestra, asi que lo que importa es que haya
        // exactamente UN panel visible, no que exista alguno.
        const panelesVisibles = await page.evaluate(() =>
          [...document.querySelectorAll('.ui-menu-panel, dialog.ui-sheet')]
            .filter((n) => n.checkVisibility()).length);
        if (panelesVisibles !== 1) {
          throw new Error(`Se esperaba 1 panel visible en ${label}px, hay ${panelesVisibles}`);
        }
      }

      const name = `switcher-${abierto ? 'open' : 'closed'}-${label}-${theme}.png`;
      await page.screenshot({ path: OUT + name });
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      results.push({ name, overflowPx: overflow });
      await context.close();
    }
  }
}

for (const target of ONBOARDING) {
  for (const [label, vp] of Object.entries(VIEWPORTS)) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        colorScheme: theme,
      });
      const page = await context.newPage();
      // Catch-all primero: una llamada sin simular llega al backend real, tumba la
      // sesion y la captura acaba en /login pareciendo un fallo del producto.
      await page.route('**/api/**', json([]));
      await page.route('**/api/v1/me', json(target.perfil));
      for (const [patron, handler] of target.rutas ?? []) {
        await page.route(patron, handler);
      }
      await page.addInitScript((t) => {
        localStorage.setItem('cellier.theme', t);
        localStorage.setItem('cellier.refreshToken', 'shot-token');
      }, theme);
      if (target.conShare) {
        await page.addInitScript(() => {
          Object.defineProperty(navigator, 'share', { value: async () => {}, configurable: true });
        });
      }

      await page.goto(BASE + target.path, { waitUntil: 'commit' });
      await page.waitForTimeout(target.esperaMs ?? 800);
      if (target.interactuar) await target.interactuar(page);
      await page.waitForTimeout(250);

      const name = `${target.slug}-${label}-${theme}.png`;
      await page.screenshot({ path: OUT + name, fullPage: label === '375' });
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      results.push({ name, overflowPx: overflow });
      await context.close();
    }
  }
}

// ---- Administrar el hogar ----
const MIEMBROS = [
  { userId: 'u0', displayName: 'Ana Rivas', email: 'ana.rivas@gmail.com', avatarUrl: null,
    role: 'ADMIN', joinedAt: '2026-08-24T20:15:30Z' },
  { userId: 'u1', displayName: 'Camila Soto', email: 'camila.soto@gmail.com', avatarUrl: null,
    role: 'MEMBER', joinedAt: '2026-09-01T10:00:00Z' },
  { userId: 'u2', displayName: 'Diego Paz', email: 'diego.paz@gmail.com', avatarUrl: null,
    role: 'ADMIN', joinedAt: '2026-09-02T11:30:00Z' },
];
const SOLICITUDES = [
  { id: 'r1', userId: 'u9', displayName: 'Camila Soto', email: 'camila.otra@gmail.com',
    avatarUrl: null, status: 'PENDING', requestedAt: '2026-09-06T09:15:02Z',
    resolvedAt: null, resolvedByUserId: null },
  { id: 'r2', userId: 'u8', displayName: 'Diego Paz', email: 'diego.otro@gmail.com',
    avatarUrl: null, status: 'PENDING', requestedAt: '2026-09-05T18:02:00Z',
    resolvedAt: null, resolvedByUserId: null },
];
const DETALLE = {
  id: HOUSEHOLD_ID, name: 'Casa Rivas', joinCode: 'K7M2QP9X',
  role: 'ADMIN', memberCount: 3, createdAt: '2026-09-01T10:00:00Z',
};
const PERFIL_ADMIN = {
  ...PROFILE,
  id: 'u0',
  // El recuento del perfil tiene que cuadrar con la lista que devuelve el mock: una
  // captura que dice "4 miembros" sobre una lista de 3 se contradice sola.
  households: PROFILE.households.map((h) =>
    h.id === HOUSEHOLD_ID ? { ...h, memberCount: 3 } : h),
};

const MANAGE = [
  { slug: 'manage', miembros: MIEMBROS, solicitudes: SOLICITUDES },
  {
    // Hogar recien creado: sin solicitudes y con una sola persona dentro.
    slug: 'manage-empty', miembros: [MIEMBROS[0]], solicitudes: [],
  },
  {
    slug: 'manage-confirm', miembros: MIEMBROS, solicitudes: SOLICITUDES,
    async interactuar(page) {
      await page.getByRole('button', { name: 'Acciones sobre Camila Soto' }).click();
      await page.getByRole('button', { name: 'Expulsar del hogar' }).click();
      await page.getByText('Expulsar a Camila Soto del hogar').waitFor({ timeout: 5000 });
    },
  },
  {
    // El unico administrador: acciones deshabilitadas y el motivo a la vista.
    slug: 'manage-last-admin', miembros: [MIEMBROS[0], MIEMBROS[1]], solicitudes: [],
    async interactuar(page) {
      await page.getByRole('button', { name: 'Acciones sobre Ana Rivas' }).click();
      await page.getByText('conservar al menos un administrador').waitFor({ timeout: 5000 });
    },
  },
  { slug: 'manage-loading', miembros: null, solicitudes: null, esperaMs: 400 },
];

// ---- Pantalla del hogar y menu de cuenta ----
// Ambas cierran agujeros de navegacion: la primera es el camino a la gestion, la segunda
// es el unico acceso a Ajustes en movil y el unico a cerrar sesion en cualquier ancho.
for (const caso of ['home', 'account-menu']) {
  for (const [label, vp] of Object.entries(VIEWPORTS)) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        colorScheme: theme,
      });
      const page = await context.newPage();
      // Catch-all primero: una llamada sin simular llega al backend real, tumba la
      // sesion y la captura acaba en /login pareciendo un fallo del producto.
      await page.route('**/api/**', json([]));
      await page.route('**/api/v1/me', json(PERFIL_ADMIN));
      await page.route('**/members', json(MIEMBROS));
      await page.route('**/join-requests**', json(SOLICITUDES));
      await page.route(`**/households/${HOUSEHOLD_ID}`, json(DETALLE));
      await page.addInitScript((t) => {
        localStorage.setItem('cellier.theme', t);
        localStorage.setItem('cellier.refreshToken', 'shot-token');
      }, theme);

      await page.goto(`${BASE}/h/${HOUSEHOLD_ID}/home`, { waitUntil: 'commit' });
      await page.waitForTimeout(1100);
      if (caso === 'account-menu') {
        await page.getByRole('button', { name: /Cuenta de/ }).filter({ visible: true }).click();
        await page.waitForTimeout(500);
      }

      const name = `${caso}-${label}-${theme}.png`;
      await page.screenshot({ path: OUT + name, fullPage: label === '375' && caso === 'home' });
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      results.push({ name, overflowPx: overflow });
      await context.close();
    }
  }
}

for (const target of MANAGE) {
  for (const [label, vp] of Object.entries(VIEWPORTS)) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        colorScheme: theme,
      });
      const page = await context.newPage();
      // Catch-all primero: una llamada sin simular llega al backend real, tumba la
      // sesion y la captura acaba en /login pareciendo un fallo del producto.
      await page.route('**/api/**', json([]));
      await page.route('**/api/v1/me', json(PERFIL_ADMIN));
      const colgada = () => {};
      await page.route('**/members', target.miembros ? json(target.miembros) : colgada);
      await page.route('**/join-requests**', target.solicitudes ? json(target.solicitudes) : colgada);
      await page.route(`**/households/${HOUSEHOLD_ID}`, target.miembros ? json(DETALLE) : colgada);
      await page.addInitScript((t) => {
        localStorage.setItem('cellier.theme', t);
        localStorage.setItem('cellier.refreshToken', 'shot-token');
      }, theme);

      await page.goto(`${BASE}/h/${HOUSEHOLD_ID}/manage`, { waitUntil: 'commit' });
      await page.waitForTimeout(target.esperaMs ?? 1100);
      if (target.interactuar) await target.interactuar(page);
      await page.waitForTimeout(350);

      const name = `${target.slug}-${label}-${theme}.png`;
      await page.screenshot({ path: OUT + name, fullPage: label === '375' && !target.interactuar });
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      results.push({ name, overflowPx: overflow });
      await context.close();
    }
  }
}


// ---- Despensa ---------------------------------------------------------------
// Los cuatro estados que comparten hueco no se pueden confundir entre si, asi que
// cada uno tiene su captura: con datos, vacia de verdad, cargando, y sin resultados.
// Las fechas se calculan contra el dia en que se corre el script; fijarlas a mano
// haria que "vence en 2 dias" fuera mentira manana.
const enDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const producto = (name, unit, category) => ({ id: `p-${name}`, name, unit, category });

const DESPENSA = [
  { id: 'i1', product: producto('Huevos', 'UNIT', 'Nevera'), quantity: 4, parLevel: 12,
    expiresAt: enDias(2), version: 3 },
  { id: 'i2', product: producto('Leche entera', 'L', 'Nevera'), quantity: 0.5, parLevel: 2,
    expiresAt: enDias(-1), version: 7 },
  { id: 'i3', product: producto('Lechuga', 'UNIT', 'Nevera'), quantity: 2, parLevel: null, version: 1 },
  { id: 'i4', product: producto('Salsa de tomate', 'ML', 'Despensa'), quantity: 690, parLevel: 1000,
    expiresAt: enDias(170), version: 2 },
  { id: 'i5', product: producto('Aceite de oliva extra virgen', 'ML', 'Despensa'), quantity: 250,
    parLevel: 1000, version: 4 },
  { id: 'i6', product: producto('Arroz grano largo', 'G', 'Despensa'), quantity: 1500, parLevel: 2000,
    version: 1 },
  // Los dos extremos del significado tienen que estar en la misma captura: este esta LLENO
  // (cantidad = objetivo) y la lechuga no tiene objetivo. En gris deben poder separarse.
  { id: 'i9', product: producto('Café en grano', 'G', 'Despensa'), quantity: 340, parLevel: 340,
    version: 6 },
  { id: 'i7', product: producto('Pan de molde', 'UNIT', 'Despensa'), quantity: 0, parLevel: 1, version: 9 },
  { id: 'i8', product: producto('Palta', 'UNIT', 'Nevera'), quantity: 0, parLevel: null, version: 5 },
];

const ESCENAS_DESPENSA = [
  { slug: 'despensa-lista', items: DESPENSA },
  { slug: 'despensa-vacia', items: [] },
  { slug: 'despensa-cargando', colgar: true, esperaMs: 700 },
  {
    slug: 'despensa-sin-resultados',
    items: DESPENSA,
    async interactuar(page) {
      // Al buscar, la respuesta pasa a vacia: es el estado "no encaja nada", que tiene
      // salida propia y no debe parecerse a la despensa vacia.
      await page.route('**/pantry/items**', json([]));
      await page.getByLabel(/Buscar en la despensa/).fill('quinoa');
      await page.waitForTimeout(600);
    },
  },
  {
    // El grupo del final, capturado a la altura a la que de verdad se lee: la captura
    // completa pinta la barra inferior a media pagina y tapa justo este titulo.
    slug: 'despensa-se-acabo',
    items: DESPENSA,
    sinPaginaEntera: true,
    async interactuar(page) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(300);
    },
  },
  {
    // El alta: hoja en movil, dialogo en escritorio. Se captura el formulario recien
    // abierto y, aparte, con el autocompletado desplegado.
    slug: 'despensa-agregar',
    items: DESPENSA,
    sinPaginaEntera: true,
    async interactuar(page, label) {
      const abrir = label === '375'
        ? page.getByRole('button', { name: 'Agregar producto', exact: true })
        : page.getByRole('button', { name: /Agregar producto/ });
      await abrir.first().click();
      await page.waitForTimeout(400);
    },
  },
  {
    slug: 'despensa-agregar-sugerencias',
    items: DESPENSA,
    sinPaginaEntera: true,
    async interactuar(page, label) {
      await page.route('**/products**', json([
        { id: 'c1', name: 'Leche entera', unit: 'L', category: 'Nevera' },
        { id: 'c2', name: 'Leche de almendras', unit: 'L', category: 'Nevera' },
        { id: 'c3', name: 'Leche condensada', unit: 'ML', category: 'Despensa' },
      ]));
      const abrir = label === '375'
        ? page.getByRole('button', { name: 'Agregar producto', exact: true })
        : page.getByRole('button', { name: /Agregar producto/ });
      await abrir.first().click();
      await page.waitForTimeout(300);
      await page.locator('dialog[open] input').first().fill('leche');
      await page.waitForTimeout(600);
    },
  },
  {
    slug: 'despensa-agregar-nuevo',
    items: DESPENSA,
    sinPaginaEntera: true,
    async interactuar(page, label) {
      await page.route('**/products**', json([]));
      const abrir = label === '375'
        ? page.getByRole('button', { name: 'Agregar producto', exact: true })
        : page.getByRole('button', { name: /Agregar producto/ });
      await abrir.first().click();
      await page.waitForTimeout(300);
      await page.locator('dialog[open] input').first().fill('Quinoa');
      await page.waitForTimeout(600);
    },
  },
  {
    // El detalle con su bitacora: el estado activo del panel, que es donde se ha roto
    // dos veces un componente de shared/ui sin que nadie lo viera.
    slug: 'despensa-detalle',
    items: DESPENSA,
    sinPaginaEntera: true,
    async interactuar(page) {
      await page.route('**/movements**', json({
        content: [
          { id: 'm1', type: 'CONSUMPTION', delta: -2, performedAt: '2026-09-13T18:30:00Z',
            performedByUserId: 'u2', performedByName: 'Bruno Soto' },
          { id: 'm2', type: 'ADJUSTMENT', delta: 1, performedAt: '2026-09-12T09:05:00Z',
            performedByUserId: 'u1', performedByName: 'Ana Rivas' },
          { id: 'm3', type: 'PURCHASE', delta: 12, performedAt: '2026-09-10T20:15:00Z',
            performedByUserId: 'u1', performedByName: 'Ana Rivas' },
        ],
        page: 0, size: 10, totalElements: 3, totalPages: 1,
      }));
      await page.getByRole('button', { name: 'Ver Huevos' }).click();
      await page.waitForTimeout(500);
    },
  },
  {
    slug: 'despensa-supermercado',
    items: DESPENSA,
    sinPaginaEntera: true,
    async interactuar(page) {
      await page.getByRole('button', { name: /Llegué del súper/ }).click();
      await page.waitForTimeout(300);
      await page.locator('dialog[open] input').first().fill('lech');
      await page.waitForTimeout(250);
    },
  },
  {
    slug: 'despensa-supermercado-resumen',
    items: DESPENSA,
    sinPaginaEntera: true,
    async interactuar(page) {
      await page.getByRole('button', { name: /Llegué del súper/ }).click();
      await page.waitForTimeout(300);
      for (const nombre of ['Huevos', 'Lechuga']) {
        await page.locator('dialog[open] input').first().fill(nombre);
        await page.waitForTimeout(250);
        await page.locator('dialog[open] ul button').first().click();
        await page.waitForTimeout(200);
        await page.getByRole('button', { name: 'Sumar', exact: true }).click();
        await page.waitForTimeout(250);
      }
      await page.getByRole('button', { name: 'Terminar', exact: true }).click();
      await page.waitForTimeout(300);
    },
  },
  { slug: 'despensa-error', error: true },
];

for (const escena of ESCENAS_DESPENSA) {
  for (const [label, vp] of Object.entries(VIEWPORTS)) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        colorScheme: theme,
      });
      const page = await context.newPage();

      // Catch-all primero: cualquier /api sin simular respondia 401, el interceptor
      // cerraba la sesion y la captura acababa en /login pareciendo un fallo del producto.
      await page.route('**/api/**', json([]));
      await page.route('**/api/v1/me', json(PROFILE));
      if (escena.colgar) {
        await page.route('**/pantry/items**', () => {});
      } else if (escena.error) {
        await page.route('**/pantry/items**', (r) => r.fulfill({ status: 500 }));
      } else {
        await page.route('**/pantry/items**', json(escena.items));
      }

      await page.addInitScript((t) => {
        localStorage.setItem('cellier.theme', t);
        localStorage.setItem('cellier.refreshToken', 'shot-token');
      }, theme);

      await page.goto(`${BASE}/h/${HOUSEHOLD_ID}/pantry`, { waitUntil: 'commit' });
      await page.waitForTimeout(escena.esperaMs ?? 1100);
      if (escena.interactuar) await escena.interactuar(page, label);

      const name = `${escena.slug}-${label}-${theme}.png`;
      await page.screenshot({ path: OUT + name, fullPage: label === '375' && !escena.sinPaginaEntera });
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);

      // La banda de nivel y las areas tactiles se miden, no se miran.
      const geometria = await page.evaluate(() => {
        const fila = document.querySelector('app-pantry-row article');
        const campo = document.querySelector('input[type="search"]');
        return {
          altoFila: fila ? Math.round(fila.getBoundingClientRect().height) : null,
          altoCampo: campo ? Math.round(campo.getBoundingClientRect().height) : null,
          filas: document.querySelectorAll('app-pantry-row').length,
        };
      });
      results.push({ name, overflowPx: overflow, ...geometria });
      await context.close();
    }
  }
}


// ---- La despensa sin color --------------------------------------------------
// El aviso de vencimiento no puede depender del tono: --warn y --danger tienen
// luminancias casi identicas, asi que en gris son el mismo gris. Lo que tiene que
// seguir separando "vence en 2 dias" de "vencio ayer" es el icono y el texto.
for (const theme of THEMES) {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, colorScheme: theme,
  });
  const page = await context.newPage();
  await page.route('**/api/**', json([]));
  await page.route('**/api/v1/me', json(PROFILE));
  await page.route('**/pantry/items**', json(DESPENSA));
  await page.addInitScript((t) => {
    localStorage.setItem('cellier.theme', t);
    localStorage.setItem('cellier.refreshToken', 'shot-token');
  }, theme);
  await page.goto(`${BASE}/h/${HOUSEHOLD_ID}/pantry`, { waitUntil: 'commit' });
  await page.waitForTimeout(1100);
  await page.addStyleTag({ content: 'html { filter: grayscale(1); }' });
  await page.waitForTimeout(200);

  const name = `despensa-gris-375-${theme}.png`;
  await page.screenshot({ path: OUT + name, fullPage: true });
  results.push({ name, note: 'escala de grises' });
  await context.close();
}


// ---- Toasts, que sólo existen cuando ocurren --------------------------------
// Un componente con estado activo no está verificado hasta que se captura EN ese
// estado. El toast-host en reposo es un contenedor vacío: lo que hay que mirar es
// el aviso encima de la pantalla, en los tres tonos y en los dos temas.
for (const [label, vp] of Object.entries(VIEWPORTS)) {
  for (const theme of THEMES) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, colorScheme: theme,
    });
    const page = await context.newPage();
    await page.route('**/api/**', json([]));
    await page.route('**/api/v1/me', json(PROFILE));
    await page.addInitScript((t) => {
      localStorage.setItem('cellier.theme', t);
      localStorage.setItem('cellier.refreshToken', 'shot-token');
    }, theme);
    await page.goto(`${BASE}/dev/ui`, { waitUntil: 'commit' });
    await page.waitForTimeout(1000);

    for (const nombre of ['Aviso correcto', 'Aviso de atención', 'Aviso de error']) {
      await page.getByRole('button', { name: nombre }).click();
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(300);

    const name = `toasts-${label}-${theme}.png`;
    await page.screenshot({ path: OUT + name });
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const visibles = await page.locator('[role="status"], [role="alert"]').count();
    results.push({ name, overflowPx: overflow, avisos: visibles });
    await context.close();
  }
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
