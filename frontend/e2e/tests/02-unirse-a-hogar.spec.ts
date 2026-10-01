import { expect, test } from '../support/fixtures';
import { loginInNewContext } from '../support/fixtures';
import { SEED_USERS, seedBaseFixture } from '../support/seed';
import type { SeedFixture } from '../support/seed';

/**
 * Flujo 2: segundo usuario entra con el código -> solicitud pendiente -> el admin
 * aprueba -> el segundo usuario ve la despensa del hogar.
 *
 * Dos sesiones en paralelo, cada una en su propio `BrowserContext` (ver
 * `loginInNewContext`): Ana aprueba desde la suya sin que eso afecte a la de Bruno.
 */
test.describe('Unirse a un hogar con el código', () => {
  let fixture: SeedFixture;

  test.beforeEach(async () => {
    fixture = await seedBaseFixture();
  });

  test('de solicitud pendiente a la despensa compartida', async ({ page, loginAs, browser }) => {
    // Bruno pide entrar con el código de "Casa Rivas".
    await loginAs(SEED_USERS.member);
    await page.goto('/onboarding');
    await page.getByLabel('Código de invitación').fill(fixture.joinCode);
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();

    await expect(page).toHaveURL(/\/onboarding\/pending$/);
    await expect(page.getByText(fixture.householdName)).toBeVisible();
    await expect(page.getByText('Esperando respuesta')).toBeVisible();

    // Ana, en una sesión aparte, aprueba la solicitud desde el panel de administración.
    const admin = await loginInNewContext(browser, SEED_USERS.admin);
    try {
      await admin.page.goto(`/h/${fixture.householdId}/manage`);
      await admin.page.getByRole('button', { name: /Aceptar/ }).first().click();
      // El nombre de Bruno aparece en más de un sitio a la vez tras aprobar —la fila de
      // miembros y el aviso de confirmación—, así que esperar a que la solicitud
      // desaparezca de "Solicitudes" es la señal inequívoca de que se resolvió.
      await expect(admin.page.getByText('No hay solicitudes esperando')).toBeVisible();
    } finally {
      await admin.context.close();
    }

    // Bruno vuelve a su pantalla de solicitudes: ahora aparece aceptada.
    await page.goto('/onboarding/pending');
    await expect(page.getByText('Aceptada')).toBeVisible();

    await page.getByRole('button', { name: new RegExp(`Entrar a ${fixture.householdName}`) }).click();

    await expect(page).toHaveURL(new RegExp(`/h/${fixture.householdId}/pantry$`));
    // La despensa de "Casa Rivas" trae Huevos sembrado: si Bruno la ve, de verdad entró
    // al hogar y no a una pantalla vacía porque el guard lo rebotó en silencio.
    await expect(page.getByText('Huevos')).toBeVisible();
  });
});
