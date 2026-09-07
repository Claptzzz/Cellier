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

await browser.close();
console.log(JSON.stringify(results, null, 2));
