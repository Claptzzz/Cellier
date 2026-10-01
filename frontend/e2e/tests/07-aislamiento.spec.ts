import { expect, test } from '../support/fixtures';
import { SEED_USERS, seedBaseFixture } from '../support/seed';
import type { SeedFixture } from '../support/seed';

/**
 * Flujo 7: un usuario que no pertenece al hogar navega a su URL directamente y recibe
 * el error correcto, sin ver ningún dato de ese hogar.
 *
 * Bruno tiene hogar propio ("Depa de Bruno") pero no es miembro de "Casa Rivas": es
 * justo el caso que distingue el guard —"tiene hogares, pero no éste"— del de quien no
 * tiene ninguno, y el que de verdad ejercita el aviso explicado en
 * `frontend/src/app/core/household/household.guard.ts`.
 */
test.describe('Aislamiento entre hogares', () => {
  let fixture: SeedFixture;

  test.beforeEach(async () => {
    fixture = await seedBaseFixture();
  });

  test('entrar a la URL de un hogar ajeno no enseña sus datos', async ({ page, loginAs }) => {
    await loginAs(SEED_USERS.member);

    await page.goto(`/h/${fixture.householdId}/pantry`);

    // Rebotado a SU hogar, nunca al de Ana.
    await expect(page).toHaveURL(new RegExp(`/h/${fixture.brunoHouseholdId}/pantry$`));
    await expect(page.getByText('No existe ese hogar, o ya no perteneces a él.')).toBeVisible();

    // Nada de "Casa Rivas" llegó a pintarse: ni el nombre del producto sembrado ahí.
    await expect(page.getByText('Huevos')).toHaveCount(0);
    await expect(page.getByText(fixture.householdName)).toHaveCount(0);
  });
});
