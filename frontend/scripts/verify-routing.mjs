/**
 * Verificación de comportamiento del enrutado por hogar.
 *
 *   node scripts/verify-routing.mjs [http://localhost:4200]
 *
 * Los tests unitarios cubren la lógica del guard con un router vacío. Esto cubre lo que
 * ellos no pueden: la configuración de rutas real, las redirecciones funcionales de las
 * URLs antiguas y el orden en que se resuelven guard, perfil y almacenamiento.
 *
 * El backend se simula: aquí se comprueba a dónde lleva cada URL, no qué responde la API.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:4300';
const CASA = '8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98';
const DEPA = 'b41d0f77-6c58-4e92-8a03-5fd91c2e7a64';
const AJENO = '11111111-2222-4333-8444-555555555555';

const perfil = (households) => ({
  id: 'u1', email: 'ana.rivas@gmail.com', displayName: 'Ana Rivas', avatarUrl: null,
  locale: 'es-CL', themePreference: 'SYSTEM', createdAt: '2026-08-24T20:15:30Z', households,
});

const CON_HOGARES = perfil([
  { id: CASA, name: 'Casa Rivas', role: 'ADMIN', memberCount: 4 },
  { id: DEPA, name: 'Depa Ñuñoa', role: 'MEMBER', memberCount: 2 },
]);
const SIN_HOGARES = perfil([]);

const browser = await chromium.launch();

async function visita({ path, profile, lastHousehold, misSolicitudes = [] }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  // Red de seguridad: cualquier peticion a /api que no este simulada se responde vacia y
  // se anota. Sin esto, un endpoint nuevo sin mock sale al backend real, vuelve 401, el
  // interceptor intenta refrescar con un token de mentira y CIERRA LA SESION: los casos
  // acaban en /login y el fallo parece del producto. Ya paso dos veces.
  const sinSimular = new Set();
  await page.route('**/api/**', (r) => {
    sinSimular.add(new URL(r.request().url()).pathname);
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/api/v1/me', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) }));
  await page.route('**/api/v1/join-requests/mine', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(misSolicitudes) }));
  // La bandeja del hogar activo: el chasis la pide para el distintivo de pendientes. Sin
  // simularla la peticion sale al backend real, vuelve 401, el interceptor intenta
  // refrescar con un token de mentira y acaba cerrando la sesion: todos los casos
  // terminaban en /login.
  await page.route('**/api/v1/households/*/join-requests**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.addInitScript(([last]) => {
    localStorage.setItem('cellier.refreshToken', 'shot-token');
    if (last) localStorage.setItem('cellier.lastHouseholdId', last);
  }, [lastHousehold]);

  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const url = new URL(page.url()).pathname;
  const aviso = await page.locator('[role="status"], [role="alert"]').first()
    .textContent().catch(() => null);
  const guardado = await page.evaluate(() => localStorage.getItem('cellier.lastHouseholdId'));
  await context.close();
  return {
    url,
    aviso: aviso?.trim().replace(/\s+/g, ' ') ?? null,
    guardado,
    sinSimular: [...sinSimular],
  };
}

const casos = [
  ['1. ruta antigua /pantry redirige al hogar de arranque',
   { path: '/pantry', profile: CON_HOGARES }, `/h/${CASA}/pantry`],
  ['2. ruta antigua /recipes conserva la seccion',
   { path: '/recipes', profile: CON_HOGARES }, `/h/${CASA}/recipes`],
  ['3. la raiz usa el ULTIMO hogar usado',
   { path: '/', profile: CON_HOGARES, lastHousehold: DEPA }, `/h/${DEPA}/pantry`],
  ['4. un id guardado que ya no es mio se descarta',
   { path: '/', profile: CON_HOGARES, lastHousehold: AJENO }, `/h/${CASA}/pantry`],
  ['5. la URL manda sobre lo guardado',
   { path: `/h/${DEPA}/templates`, profile: CON_HOGARES, lastHousehold: CASA }, `/h/${DEPA}/templates`],
  ['6. hogar ajeno: al mio, conservando la seccion',
   { path: `/h/${AJENO}/templates`, profile: CON_HOGARES }, `/h/${CASA}/templates`],
  ['7. sin hogares y sin solicitudes -> bienvenida',
   { path: `/h/${CASA}/pantry`, profile: SIN_HOGARES }, '/onboarding'],
  ['8. sin hogares CON solicitud pendiente -> sala de espera',
   { path: `/h/${CASA}/pantry`, profile: SIN_HOGARES,
     misSolicitudes: [{ id: 's1', householdId: CASA, householdName: 'Casa Rivas',
                        status: 'PENDING', requestedAt: '2026-09-04T09:15:02Z', resolvedAt: null }] },
   '/onboarding/pending'],
  ['9. ajustes se queda FUERA de /h/:householdId',
   { path: '/settings', profile: CON_HOGARES }, '/settings'],
  ['10. manage exige rol de administrador (Depa: MEMBER)',
   { path: `/h/${DEPA}/manage`, profile: CON_HOGARES }, `/h/${DEPA}/home`],
  ['11. manage se abre siendo administradora (Casa: ADMIN)',
   { path: `/h/${CASA}/manage`, profile: CON_HOGARES }, `/h/${CASA}/manage`],
  ['12. quien ya tiene sesion no se queda en /login',
   { path: '/login', profile: CON_HOGARES, lastHousehold: DEPA }, `/h/${DEPA}/pantry`],
  ['13. una URL desconocida cae en el hogar de arranque, no en un 404',
   { path: '/esto-no-existe', profile: CON_HOGARES }, `/h/${CASA}/pantry`],
];

let fallos = 0;
const huecos = new Set();
for (const [nombre, opciones, esperado] of casos) {
  const { url, aviso, guardado, sinSimular } = await visita(opciones);
  sinSimular.forEach((u) => huecos.add(u));
  const ok = url === esperado;
  if (!ok) fallos++;
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}`);
  console.log(`      esperado ${esperado}`);
  console.log(`      obtenido ${url}${aviso ? `  · aviso: "${aviso}"` : ''}${guardado ? `  · recordado: ${guardado.slice(0, 8)}…` : ''}`);
}

// Indistinguibilidad: un hogar ajeno y uno inexistente deben producir lo mismo.
const a = await visita({ path: `/h/${AJENO}/pantry`, profile: CON_HOGARES });
const b = await visita({ path: '/h/no-existe-en-ninguna-parte/pantry', profile: CON_HOGARES });
const iguales = a.url === b.url && a.aviso === b.aviso;
if (!iguales) fallos++;
console.log(`${iguales ? 'OK  ' : 'FALLA'} 14. hogar ajeno e inexistente son indistinguibles`);
console.log(`      ajeno       -> ${a.url} · "${a.aviso}"`);
console.log(`      inexistente -> ${b.url} · "${b.aviso}"`);

await browser.close();
if (huecos.size) {
  console.log(`\nAviso: ${huecos.size} endpoint(s) sin simular, respondidos vacios:`);
  [...huecos].forEach((u) => console.log(`  ${u}`));
}
console.log(fallos === 0 ? '\nTodos los casos pasan.' : `\n${fallos} caso(s) fallan.`);
process.exit(fallos === 0 ? 0 : 1);
