import { expect, test } from '../support/fixtures';
import { SEED_USERS, seedBaseFixture } from '../support/seed';
import type { SeedFixture } from '../support/seed';

/**
 * Flujo 5: filtrar por "Puedo cocinarla" muestra exactamente la receta completable;
 * consumir un ingrediente la mueve a "Me faltan".
 *
 * La semilla deja "Tortilla de huevo" lista (pide 3 Huevos, hay 6) y "Tarta de manzana"
 * sin poder hacerse (pide Canela, que no está en ninguna despensa).
 */
test.describe('Filtrar recetas por disponibilidad', () => {
  let fixture: SeedFixture;

  test.beforeEach(async () => {
    fixture = await seedBaseFixture();
  });

  test('"Puedo cocinarla" trae sólo la receta completable; consumir la mueve a "Me faltan"', async ({ page, loginAs }) => {
    await loginAs(SEED_USERS.admin);
    await page.goto(`/h/${fixture.householdId}/recipes`);

    await page.getByRole('radio', { name: 'Puedo cocinarla' }).click();
    await expect(page.getByRole('link', { name: new RegExp(`^${fixture.recipeReadyName}`) })).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(`^${fixture.recipeMissingName}`) })).toHaveCount(0);

    await page.getByRole('radio', { name: 'Me faltan' }).click();
    await expect(page.getByRole('link', { name: new RegExp(`^${fixture.recipeMissingName}`) })).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(`^${fixture.recipeReadyName}`) })).toHaveCount(0);

    // Se consume el huevo que "Tortilla de huevo" necesita: con 0 en la despensa deja de
    // ser completable. Por rol de "textbox", no por label: el contenedor `role="group"`
    // del stepper comparte el mismo aria-label que su <input>.
    await page.goto(`/h/${fixture.householdId}/pantry`);
    const cantidadHuevos = page.getByRole('textbox', { name: 'Cantidad de Huevos' });
    await cantidadHuevos.fill('0');
    await cantidadHuevos.press('Enter');

    await page.goto(`/h/${fixture.householdId}/recipes`);
    await page.getByRole('radio', { name: 'Me faltan' }).click();
    await expect(page.getByRole('link', { name: new RegExp(`^${fixture.recipeReadyName}`) })).toBeVisible();

    await page.getByRole('radio', { name: 'Puedo cocinarla' }).click();
    await expect(page.getByRole('link', { name: new RegExp(`^${fixture.recipeReadyName}`) })).toHaveCount(0);
  });
});
