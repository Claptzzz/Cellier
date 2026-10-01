import type { Page } from '@playwright/test';

import { expect, test } from '../support/fixtures';
import { SEED_USERS, seedBaseFixture } from '../support/seed';
import type { SeedFixture } from '../support/seed';

/**
 * Flujo 4: crear una plantilla con 3 productos, generar el reporte, y comprobar los
 * faltantes calculados contra lo que hay sembrado en la despensa.
 */
test.describe('Plantilla nueva y su reporte de faltantes', () => {
  let fixture: SeedFixture;

  test.beforeEach(async () => {
    fixture = await seedBaseFixture();
  });

  test('el reporte calcula lo que falta de cada producto', async ({ page, loginAs }) => {
    await loginAs(SEED_USERS.admin);
    await page.goto(`/h/${fixture.householdId}/templates`);

    await page.getByRole('button', { name: 'Nueva plantilla' }).click();
    const dialogoNombre = page.locator('dialog[open]');
    await dialogoNombre.getByLabel('Nombre').fill('Plantilla E2E');
    await dialogoNombre.getByRole('button', { name: 'Crear' }).click();
    await expect(dialogoNombre).toBeHidden();

    await page.getByRole('link', { name: 'Plantilla E2E' }).click();
    await expect(page).toHaveURL(/\/templates\/[^/]+$/);

    // Tres productos, cada uno pedido por encima de lo que hay en la despensa sembrada
    // (Huevos: 6, Manzana: 6, Leche entera: 2), para que el reporte tenga faltantes de
    // verdad que comprobar, no sólo líneas.
    await agregarProducto(page, 'Huevos', 12);
    await agregarProducto(page, 'Manzana', 10);
    await agregarProducto(page, 'Leche entera', 4);

    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Todo guardado')).toBeVisible();

    await page.getByRole('link', { name: 'Generar reporte' }).click();
    await expect(page).toHaveURL(/\/report$/);

    await expect(page.getByText('Faltan 3 productos.')).toBeVisible();
    await expect(page.getByText(/Faltan 6 · tienes 6 de 12 un/)).toBeVisible();
    await expect(page.getByText(/Faltan 4 · tienes 6 de 10 un/)).toBeVisible();
    await expect(page.getByText(/Faltan 2 · tienes 2 de 4 L/)).toBeVisible();
  });
});

async function agregarProducto(page: Page, nombre: string, cantidad: number): Promise<void> {
  await page.getByLabel('Agregar un producto').fill(nombre);
  await page.getByRole('button', { name: new RegExp(`^${nombre}`) }).click();
  // Por rol de "textbox", no por label: el contenedor `role="group"` del stepper comparte
  // el mismo aria-label que su <input>, y getByLabel resuelve ambos (modo estricto falla).
  const cantidadCampo = page.getByRole('textbox', { name: `Cantidad deseada de ${nombre}` });
  await cantidadCampo.fill(String(cantidad));
  await cantidadCampo.press('Enter');
  // Limpia la búsqueda para que la siguiente coincidencia no la encuentre ya agregada.
  await page.getByLabel('Agregar un producto').fill('');
}
