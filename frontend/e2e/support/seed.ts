import { request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

import { BACKEND_BASE_URL } from '../playwright.config';

/**
 * Los dos usuarios semilla. `admin` siempre es quien crea y administra "Casa Rivas" en
 * {@link seedBaseFixture}; `member` existe pero NO pertenece a ese hogar —tiene el suyo
 * propio, vacío— porque unirse a él es justo lo que prueban los flujos 2 y 7.
 */
export const SEED_USERS = {
  admin: { email: 'ana@e2e.cellier.test', displayName: 'Ana Rivas' },
  member: { email: 'bruno@e2e.cellier.test', displayName: 'Bruno Soto' },
} as const;

export interface SeedUser {
  readonly email: string;
  readonly displayName: string;
}

interface LoginResult {
  readonly accessToken: string;
  readonly refreshToken: string;
}

async function apiContext(extraHeaders?: Record<string, string>): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: BACKEND_BASE_URL, extraHTTPHeaders: extraHeaders });
}

/**
 * Emite credenciales reales de Cellier para un usuario semilla, sin pasar por Google.
 * Lo sirve `TestSupportController`, que sólo existe bajo el perfil `test` (ver
 * `backend/src/main/java/com/cellier/identity/web/TestSupportController.java`).
 */
export async function testLogin(user: SeedUser): Promise<LoginResult> {
  const ctx = await apiContext();
  try {
    const response = await ctx.post('/api/v1/auth/test/login', { data: user });
    if (!response.ok()) {
      throw new Error(
        `POST /api/v1/auth/test/login falló (${response.status()}) para ${user.email}: ${await response.text()}`);
    }
    return await response.json();
  } finally {
    await ctx.dispose();
  }
}

/**
 * Vacía el esquema entero de la base E2E. Lo llama {@link seedBaseFixture} antes de
 * sembrar, para que cada archivo de test empiece de un estado conocido y no herede nada
 * de la corrida anterior.
 */
export async function resetDatabase(): Promise<void> {
  const ctx = await apiContext();
  try {
    const response = await ctx.post('/api/v1/auth/test/reset');
    if (!response.ok()) {
      throw new Error(`POST /api/v1/auth/test/reset falló (${response.status()}): ${await response.text()}`);
    }
  } finally {
    await ctx.dispose();
  }
}

export interface SeedProduct {
  readonly id: string;
  readonly pantryItemId: string;
}

export interface SeedFixture {
  readonly householdId: string;
  readonly householdName: string;
  readonly joinCode: string;
  /** El hogar propio de Bruno: existe para que tenga hogares sin pertenecer a "Casa Rivas". */
  readonly brunoHouseholdId: string;
  readonly products: {
    readonly huevos: SeedProduct;
    readonly manzana: SeedProduct;
    readonly leche: SeedProduct;
  };
  readonly templateId: string;
  readonly templateName: string;
  /** "Tortilla de huevo": con Huevos en la despensa, lista para cocinarse. */
  readonly recipeReadyId: string;
  readonly recipeReadyName: string;
  /** "Tarta de manzana": pide Canela, que no está en ninguna despensa. */
  readonly recipeMissingId: string;
  readonly recipeMissingName: string;
}

/**
 * Siembra el escenario base que usan los flujos 3 a 7: Ana crea "Casa Rivas" con tres
 * productos en la despensa, una plantilla y dos recetas —una completable, otra no—, y
 * Bruno queda con un hogar propio y separado, sin pertenecer a "Casa Rivas".
 *
 * Todo se crea llamando a la API real (no insertando filas a mano): es la misma garantía
 * que ya exige el resto del backend —invariantes de negocio incluidas— y además deja la
 * siembra escrita contra el mismo contrato que ejercitan los propios tests.
 */
export async function seedBaseFixture(): Promise<SeedFixture> {
  await resetDatabase();

  const { accessToken } = await testLogin(SEED_USERS.admin);
  const ana = await apiContext({ Authorization: `Bearer ${accessToken}` });

  try {
    const household = await json(await ana.post('/api/v1/households', { data: { name: 'Casa Rivas' } }));
    const base = `/api/v1/households/${household.id}`;

    const huevos = await json(await ana.post(`${base}/pantry/items`, {
      data: { productName: 'Huevos', unit: 'UNIT', quantity: 6 },
    }));
    const manzana = await json(await ana.post(`${base}/pantry/items`, {
      data: { productName: 'Manzana', unit: 'UNIT', quantity: 6 },
    }));
    const leche = await json(await ana.post(`${base}/pantry/items`, {
      data: { productName: 'Leche entera', unit: 'L', quantity: 2 },
    }));
    // Canela NO entra en la despensa a propósito: es el ingrediente, obligatorio, que le
    // falta a "Tarta de manzana" para poder cocinarse.

    const template = await json(await ana.post(`${base}/templates`, {
      data: {
        name: 'Compra semanal',
        items: [
          { productId: huevos.product.id, desiredQuantity: 12 },
          { productId: manzana.product.id, desiredQuantity: 10 },
          { productId: leche.product.id, desiredQuantity: 4 },
        ],
      },
    }));

    const recipeReady = await json(await ana.post(`${base}/recipes`, {
      data: {
        name: 'Tortilla de huevo',
        servings: 2,
        ingredients: [{ productId: huevos.product.id, quantity: 3, optional: false }],
        steps: ['Batir los huevos con sal.', 'Cocinar en la sartén 3 minutos por lado.'],
      },
    }));

    const recipeMissing = await json(await ana.post(`${base}/recipes`, {
      data: {
        name: 'Tarta de manzana',
        servings: 6,
        ingredients: [
          { productId: manzana.product.id, quantity: 6, optional: false },
          { productName: 'Canela', unit: 'G', quantity: 5, optional: false },
        ],
        steps: ['Pelar y laminar las manzanas.', 'Hornear 40 minutos a 180°C.'],
      },
    }));

    // El hogar propio de Bruno: separado, para que "tiene hogares pero no éste" (R del
    // guard de aislamiento) sea el caso real, no "no tiene ninguno".
    const { accessToken: brunoToken } = await testLogin(SEED_USERS.member);
    const bruno = await apiContext({ Authorization: `Bearer ${brunoToken}` });
    let brunoHouseholdId: string;
    try {
      const brunoHousehold = await json(await bruno.post('/api/v1/households', { data: { name: 'Depa de Bruno' } }));
      brunoHouseholdId = brunoHousehold.id;
    } finally {
      await bruno.dispose();
    }

    return {
      householdId: household.id,
      householdName: household.name,
      joinCode: household.joinCode,
      brunoHouseholdId,
      products: {
        huevos: { id: huevos.product.id, pantryItemId: huevos.id },
        manzana: { id: manzana.product.id, pantryItemId: manzana.id },
        leche: { id: leche.product.id, pantryItemId: leche.id },
      },
      templateId: template.id,
      templateName: template.name,
      recipeReadyId: recipeReady.id,
      recipeReadyName: recipeReady.name,
      recipeMissingId: recipeMissing.id,
      recipeMissingName: recipeMissing.name,
    };
  } finally {
    await ana.dispose();
  }
}

async function json(response: Awaited<ReturnType<APIRequestContext['post']>>): Promise<any> {
  if (!response.ok()) {
    throw new Error(`${response.url()} respondió ${response.status()}: ${await response.text()}`);
  }
  return response.json();
}
