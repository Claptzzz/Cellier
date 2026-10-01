import { test as base } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { type SeedUser, testLogin } from './seed';

export const REFRESH_TOKEN_STORAGE_KEY = 'cellier.refreshToken';

interface Fixtures {
  /**
   * Deja la `page` autenticada como el usuario indicado, sin tocar el flujo real de
   * Google: pide credenciales a `TestSupportController` y escribe el refresh token donde
   * `AuthService` lo espera. A partir de ahí es exactamente el camino de un recargo de
   * página con sesión abierta —`ensureProfileLoaded` lo canjea por un access token él
   * solo—, así que lo que se prueba después es la aplicación real, no un atajo de test.
   */
  loginAs: (user: SeedUser) => Promise<void>;
}

export const test = base.extend<Fixtures>({
  loginAs: async ({ page }, use) => {
    await use((user: SeedUser) => loginAs(page, user));
  },
});

async function loginAs(page: Page, user: SeedUser): Promise<void> {
  const { refreshToken } = await testLogin(user);
  // localStorage sólo existe una vez que hay un documento del mismo origen cargado:
  // hace falta una navegación antes de poder escribir en él.
  await page.goto('/login');
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: REFRESH_TOKEN_STORAGE_KEY, value: refreshToken },
  );
}

/**
 * Una sesión aparte, en su propio `BrowserContext` —no una pestaña nueva del mismo—,
 * para los escenarios con dos personas a la vez: `localStorage` es por origen y se
 * comparte entre todas las pestañas de un mismo contexto, así que dos sesiones en el
 * mismo contexto se pisarían el refresh token la una a la otra.
 *
 * Quien llama es responsable de cerrar el contexto devuelto.
 */
export async function loginInNewContext(
  browser: Browser,
  user: SeedUser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, user);
  return { context, page };
}

export { expect } from '@playwright/test';
