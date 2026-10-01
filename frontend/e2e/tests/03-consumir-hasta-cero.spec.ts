import { expect, test } from '../support/fixtures';
import { SEED_USERS, seedBaseFixture } from '../support/seed';
import type { SeedFixture } from '../support/seed';

/**
 * Flujo 3: agregar un producto a la despensa, consumirlo hasta 0, y comprobar que
 * aparece en "Se acabó" con el movimiento registrado.
 */
test.describe('Consumir un producto hasta que se acaba', () => {
  let fixture: SeedFixture;

  test.beforeEach(async () => {
    fixture = await seedBaseFixture();
  });

  test('un producto en 0 se mueve a "Se acabó" y queda su movimiento', async ({ page, loginAs }) => {
    await loginAs(SEED_USERS.admin);
    await page.goto(`/h/${fixture.householdId}/pantry`);

    // Agregar: "Pan de molde" no tiene ninguna coincidencia en el catálogo del hogar, así
    // que en cuanto la búsqueda responde la propia pantalla pregunta la unidad directo,
    // sin pedir permiso para crear (sólo lo pide cuando hay sugerencias que descartar).
    await page.getByRole('button', { name: /Agregar producto/ }).first().click();
    const dialogo = page.locator('dialog[open]');
    await dialogo.getByLabel('Producto').fill('Pan de molde');
    await dialogo.getByLabel('Unidad').selectOption('UNIT');
    await dialogo.getByLabel('Cantidad').fill('4');
    await dialogo.getByRole('button', { name: 'Agregar' }).click();
    await expect(dialogo).toBeHidden();

    // Antes de consumir: vive entre los artículos disponibles, no en "Se acabó".
    await expect(page.getByRole('heading', { name: 'Se acabó' })).toBeHidden();
    const cantidadPanDeMolde = page.getByRole('textbox', { name: 'Cantidad de Pan de molde' });
    await expect(cantidadPanDeMolde).toHaveValue('4');

    // Consumir hasta 0: escribir el valor directo es un solo gesto fiable, equivalente
    // a pulsar el botón «−» las veces que haga falta.
    await cantidadPanDeMolde.fill('0');
    await cantidadPanDeMolde.press('Enter');

    await expect(page.getByRole('heading', { name: 'Se acabó' })).toBeVisible();
    const filaAcabada = page.locator('article', { hasText: 'Pan de molde' });
    await expect(filaAcabada).toBeVisible();

    // El movimiento: se abre el detalle y se comprueba que la bitácora no está vacía.
    await page.getByRole('button', { name: 'Ver Pan de molde' }).click();
    await expect(page.getByRole('heading', { name: 'Movimientos' })).toBeVisible();
    await expect(page.getByText('Todavía no hay movimientos.')).toBeHidden();
  });
});
