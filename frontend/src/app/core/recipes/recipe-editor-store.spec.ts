import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { RecipeEditorStore } from './recipe-editor-store';
import type { CatalogProduct, RecipeDetail } from './recipe.models';

const HUEVOS: CatalogProduct = { id: 'p1', name: 'Huevos', unit: 'UNIT', category: 'Frescos' };
const CANELA: CatalogProduct = { id: 'p2', name: 'Canela', unit: 'G', category: 'Despensa' };

function detail(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    id: 'r1',
    name: 'Tarta de manzana',
    createdAt: '2026-08-24T15:00:00Z',
    updatedAt: '2026-09-02T11:20:00Z',
    ingredients: [
      { id: 'i1', productId: 'p1', productName: 'Huevos', unit: 'UNIT', category: 'Frescos', quantity: 6, optional: false },
    ],
    steps: [
      { position: 1, instruction: 'Batir los huevos.' },
      { position: 2, instruction: 'Hornear 40 minutos.' },
    ],
    ...overrides,
  };
}

function setupEditing(inicial = detail()) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), RecipeEditorStore],
  });
  const store = TestBed.inject(RecipeEditorStore);
  const http = TestBed.inject(HttpTestingController);
  store.load('casa', 'r1');
  http.expectOne((r) => r.method === 'GET').flush(inicial);
  return { store, http };
}

function setupCreating() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), RecipeEditorStore],
  });
  const store = TestBed.inject(RecipeEditorStore);
  const http = TestBed.inject(HttpTestingController);
  store.startCreate('casa');
  return { store, http };
}

describe('RecipeEditorStore · edición', () => {
  it('recién cargada no hay nada que guardar', () => {
    const { store } = setupEditing();

    expect(store.loaded()).toBe(true);
    expect(store.isDirty()).toBe(false);
    expect(store.ingredients().length).toBe(1);
    expect(store.steps()).toEqual(['Batir los huevos.', 'Hornear 40 minutos.']);
  });

  it('cambiar el nombre ensucia; devolverlo lo deja limpio otra vez', () => {
    const { store } = setupEditing();

    store.setName('Tarta francesa');
    expect(store.isDirty()).toBe(true);

    store.setName('Tarta de manzana');
    expect(store.isDirty()).toBe(false);
  });

  it('añadir y quitar el mismo ingrediente deja la receta como estaba', () => {
    const { store } = setupEditing();

    store.addExistingIngredient(CANELA, 5, true);
    expect(store.isDirty()).toBe(true);

    const quitado = store.removeIngredient(store.ingredients()[1].key);
    expect(store.isDirty()).toBe(false);
    expect(quitado?.item.productName).toBe('Canela');
  });

  it('el mismo producto no entra dos veces', () => {
    const { store } = setupEditing();

    store.addExistingIngredient(HUEVOS, 3, false);

    expect(store.ingredients().length).toBe(1);
    expect(store.isDirty()).toBe(false);
  });

  it('un ingrediente por nombre se manda sin productId, con la unidad elegida', () => {
    const { store, http } = setupEditing();

    store.addNewIngredient('Sal', 'G', 2, true);
    store.save();

    const guardado = http.expectOne((r) => r.method === 'PUT');
    expect(guardado.request.body.ingredients).toContainEqual(
      { productName: 'Sal', unit: 'G', quantity: 2, optional: true });
  });

  it('deshacer devuelve el ingrediente a SU sitio, no al final', () => {
    const { store } = setupEditing(detail({
      ingredients: [
        { id: 'i1', productId: 'p1', productName: 'Huevos', unit: 'UNIT', quantity: 6, optional: false },
        { id: 'i2', productId: 'p2', productName: 'Canela', unit: 'G', quantity: 5, optional: true },
        { id: 'i3', productId: 'p3', productName: 'Harina', unit: 'G', quantity: 300, optional: false },
      ],
    }));

    const quitado = store.removeIngredient(store.ingredients()[1].key)!;
    expect(store.ingredients().map((i) => i.productName)).toEqual(['Huevos', 'Harina']);

    store.restoreIngredient(quitado.item, quitado.index);

    expect(store.ingredients().map((i) => i.productName)).toEqual(['Huevos', 'Canela', 'Harina']);
    expect(store.isDirty()).toBe(false);
  });

  it('mover un paso reordena sin cambiar el texto de ninguno', () => {
    const { store } = setupEditing(detail({
      steps: [
        { position: 1, instruction: 'Uno' },
        { position: 2, instruction: 'Dos' },
        { position: 3, instruction: 'Tres' },
      ],
    }));

    store.moveStep(0, 2);

    expect(store.steps()).toEqual(['Dos', 'Tres', 'Uno']);
    expect(store.isDirty()).toBe(true);

    store.moveStep(2, 0);
    expect(store.steps()).toEqual(['Uno', 'Dos', 'Tres']);
    expect(store.isDirty()).toBe(false);
  });

  it('añadir un paso en blanco no hace nada', () => {
    const { store } = setupEditing();

    store.addStep('   ');

    expect(store.steps().length).toBe(2);
    expect(store.isDirty()).toBe(false);
  });

  it('guardar manda la receta entera y deja de haber cambios pendientes', () => {
    const { store, http } = setupEditing();
    store.setServings(4);
    store.addStep('Dejar enfriar.');
    store.save();

    const guardado = http.expectOne((r) => r.method === 'PUT');
    expect(guardado.request.body).toEqual({
      name: 'Tarta de manzana',
      description: undefined,
      servings: 4,
      prepMinutes: undefined,
      ingredients: [{ productId: 'p1', quantity: 6, optional: false }],
      steps: ['Batir los huevos.', 'Hornear 40 minutos.', 'Dejar enfriar.'],
    });

    guardado.flush(detail({ servings: 4, steps: [
      { position: 1, instruction: 'Batir los huevos.' },
      { position: 2, instruction: 'Hornear 40 minutos.' },
      { position: 3, instruction: 'Dejar enfriar.' },
    ] }));
    expect(store.isDirty()).toBe(false);
  });

  it('si guardar falla, lo editado NO se pierde', () => {
    const { store, http } = setupEditing();
    store.setName('Tarta francesa');
    store.save();

    http.expectOne((r) => r.method === 'PUT').flush(
      { detail: 'No se pudo guardar.' },
      { status: 400, statusText: 'Bad Request' });

    expect(store.name()).toBe('Tarta francesa');
    expect(store.isDirty()).toBe(true);
    expect(store.error()).toContain('No se pudo guardar');
  });
});

describe('RecipeEditorStore · alta', () => {
  it('empieza limpia, y escribir el nombre ensucia', () => {
    const { store } = setupCreating();

    expect(store.isNew()).toBe(true);
    expect(store.isDirty()).toBe(false);

    store.setName('Idea nueva');
    expect(store.isDirty()).toBe(true);
  });

  it('guardar hace POST y, al volver, deja de ser una receta nueva', () => {
    const { store, http } = setupCreating();
    store.setName('Idea nueva');
    store.addStep('Primer paso.');
    store.save();

    const guardado = http.expectOne((r) => r.method === 'POST');
    expect(guardado.request.body.name).toBe('Idea nueva');

    guardado.flush(detail({ id: 'r9', name: 'Idea nueva', steps: [{ position: 1, instruction: 'Primer paso.' }] }));

    expect(store.isNew()).toBe(false);
    expect(store.recipe()?.id).toBe('r9');
    expect(store.isDirty()).toBe(false);
  });
});
