import { expect, test } from '../support/fixtures';
import { resetDatabase } from '../support/seed';

/**
 * Flujo 6: alternar el tema y comprobar que persiste tras recargar la página.
 */
test.describe('El tema elegido persiste', () => {
  test.beforeEach(async () => {
    await resetDatabase();
  });

  test('pasar a oscuro se conserva después de recargar', async ({ page, loginAs }) => {
    const email = `tema-${Date.now()}@e2e.cellier.test`;
    await loginAs({ email, displayName: 'Quien Prueba el Tema' });

    await page.goto('/settings');
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    await page.getByRole('radio', { name: 'Oscuro' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('radio', { name: 'Oscuro', checked: true })).toBeVisible();
  });
});
