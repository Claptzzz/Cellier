import { expect, test } from '../support/fixtures';
import { resetDatabase } from '../support/seed';

/**
 * Flujo 1: login sin hogares -> crear hogar -> llegar a la despensa.
 *
 * El usuario es nuevo en cada corrida (correo con timestamp): `resetDatabase` ya deja el
 * esquema vacío, pero un correo fijo reutilizado entre corridas locales seguidas
 * arrastraría el hogar que la corrida anterior creó en el mismo test.
 */
test.describe('Alta: sin hogares hasta la despensa', () => {
  test.beforeEach(async () => {
    await resetDatabase();
  });

  test('crear un hogar lleva directo a su despensa, vacía', async ({ page, loginAs }) => {
    const email = `onboarding-${Date.now()}@e2e.cellier.test`;
    await loginAs({ email, displayName: 'Nueva Usuaria' });

    await page.goto('/');
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole('heading', { name: 'Empecemos por tu hogar' })).toBeVisible();

    await page.getByLabel('Nombre del hogar').fill('Casa de Prueba');
    await page.getByRole('button', { name: 'Crear hogar' }).click();

    await expect(page.getByRole('heading', { name: 'Tu hogar está listo' })).toBeVisible();
    await page.getByRole('button', { name: /Entrar a Casa de Prueba/ }).click();

    await expect(page).toHaveURL(/\/h\/[^/]+\/pantry$/);
    // Hogar recién creado: sin productos, así que la despensa muestra su estado vacío,
    // no el botón "Agregar producto" del toolbar de filtros —ese sólo se pinta cuando
    // hay algo que filtrar (`showFilters()` en pantry-page.ts)—. "Agregar el primero" es
    // el único botón de alta que existe aquí, en cualquier viewport.
    await expect(page.getByRole('heading', { name: 'Tu despensa está vacía' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agregar el primero' })).toBeVisible();
  });
});
