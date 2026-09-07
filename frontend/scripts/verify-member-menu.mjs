/**
 * Geometria del menu de acciones de un miembro, abierto en la PRIMERA y en la ULTIMA fila
 * de una lista larga con scroll.
 *
 *   node scripts/verify-member-menu.mjs [http://localhost:4200]
 *
 * Existe porque un panel anclado dentro de una fila tiene la misma familia de problemas
 * que tuvo la hoja inferior: un elemento fuera de vista NO esta oculto, asi que pasa
 * cualquier comprobacion de visibilidad. La unica forma de cazarlo es medir.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:4300';
const HID = '8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98';

// Lista larga a proposito: con pocas filas la ultima queda a media pantalla y el
// caso incomodo —el disparador pegado al borde inferior— no llega a darse.
const miembros = Array.from({ length: 30 }, (_, i) => ({
  userId: `u${i}`,
  displayName: i === 0 ? 'Ana Rivas' : `Persona ${i}`,
  email: `persona${i}@example.com`,
  avatarUrl: null,
  role: i === 0 ? 'ADMIN' : 'MEMBER',
  joinedAt: '2026-09-01T10:00:00Z',
}));

const PERFIL = {
  id: 'u0', email: 'persona0@example.com', displayName: 'Ana Rivas', avatarUrl: null,
  locale: 'es-CL', themePreference: 'SYSTEM', createdAt: '2026-08-24T20:15:30Z',
  households: [{ id: HID, name: 'Casa Rivas', role: 'ADMIN', memberCount: 30 }],
};

const json = (body) => (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const browser = await chromium.launch();
let fallos = 0;

for (const width of [375, 1440]) {
  for (const fila of ['primera', 'ultima']) {
    const context = await browser.newContext({ viewport: { width, height: 812 } });
    const page = await context.newPage();
    await page.route('**/api/v1/me', json(PERFIL));
    await page.route('**/members', json(miembros));
    await page.route('**/join-requests**', json([]));
    await page.route(`**/households/${HID}`, json({
      id: HID, name: 'Casa Rivas', joinCode: 'K7M2QP9X',
      role: 'ADMIN', memberCount: 30, createdAt: '2026-09-01T10:00:00Z',
    }));
    await page.addInitScript(() => localStorage.setItem('cellier.refreshToken', 't'));

    await page.goto(`${BASE}/h/${HID}/manage`, { waitUntil: 'commit' });
    await page.getByRole('button', { name: /Acciones sobre/ }).first().waitFor({ timeout: 10000 });

    const disparadores = page.getByRole('button', { name: /Acciones sobre/ });
    const objetivo = fila === 'primera' ? disparadores.first() : disparadores.last();

    if (fila === 'ultima') {
      // Se coloca el disparador pegado al borde INFERIOR del viewport, que es el caso
      // incomodo. No vale `scrollIntoViewIfNeeded` (centra la fila) ni desplazar al
      // fondo de la pagina (debajo de los miembros hay otra seccion, y la ultima fila
      // acaba a media altura). Hay que calcular el desplazamiento a mano.
      await objetivo.evaluate((el) => {
        const y = el.getBoundingClientRect().bottom + window.scrollY;
        window.scrollTo(0, y - window.innerHeight + 24);
      });
    } else {
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.waitForTimeout(300);

    const caja = await objetivo.boundingBox();
    const desdeAbajo = Math.round(812 - (caja?.y ?? 0) - (caja?.height ?? 0));

    await objetivo.click();
    await page.waitForTimeout(450);

    const medida = await page.evaluate(() => {
      const panel = document.querySelector('.ui-menu-panel');
      const hoja = [...document.querySelectorAll('dialog.ui-sheet')].find((d) => d.open);
      const objetivo = panel ?? hoja?.querySelector('.ui-sheet-panel');
      if (!objetivo) return null;
      const r = objetivo.getBoundingClientRect();
      return {
        contenedor: panel ? 'panel anclado' : 'hoja inferior',
        volteado: panel ? panel.classList.contains('ui-menu-panel--above') : null,
        top: Math.round(r.top), bottom: Math.round(r.bottom),
        alto: Math.round(r.height), viewportH: window.innerHeight,
        dentroDeVista: r.top >= 0 && r.bottom <= window.innerHeight + 1,
        // Que se vea de verdad: se comprueba que el punto central del panel devuelva un
        // nodo del propio panel, no algo que este por encima tapandolo.
        alFrente: (() => {
          const x = r.left + r.width / 2;
          const y = r.top + Math.min(r.height / 2, window.innerHeight / 2);
          const enPunto = document.elementFromPoint(x, y);
          return enPunto ? objetivo.contains(enPunto) || objetivo === enPunto : false;
        })(),
      };
    });

    const ok = medida && medida.dentroDeVista && medida.alFrente;
    if (!ok) fallos++;
    console.log(`${ok ? 'OK   ' : 'FALLA'} ${width}px · ${fila} fila`);
    console.log(`      disparador a ${desdeAbajo}px del borde inferior`);
    console.log(`      ${JSON.stringify(medida)}`);
    await context.close();
  }
}

await browser.close();
console.log(fallos === 0
  ? '\nEl menu de acciones queda dentro de vista y al frente en los cuatro casos.'
  : `\n${fallos} caso(s) fallan.`);
process.exit(fallos === 0 ? 0 : 1);
