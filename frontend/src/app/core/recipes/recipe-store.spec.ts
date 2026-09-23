import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { HouseholdContextService } from '../household/household-context.service';
import { RecipeStore, SEARCH_DEBOUNCE_MS } from './recipe-store';
import type { RecipeSummary } from './recipe.models';

const householdId = signal<string | null>('casa');

function recipe(name: string, availability: 'READY' | 'MISSING' = 'MISSING', missingCount = 1): RecipeSummary {
  return {
    id: name,
    name,
    ingredientCount: 3,
    missingCount,
    availability,
    createdAt: '2026-08-24T15:00:00Z',
    updatedAt: '2026-09-02T11:20:00Z',
  };
}

function setup() {
  TestBed.resetTestingModule();
  householdId.set('casa');
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: HouseholdContextService, useValue: { householdId } },
    ],
  });
  const store = TestBed.inject(RecipeStore);
  const http = TestBed.inject(HttpTestingController);
  TestBed.tick();
  return { store, http };
}

/** Responde a la petición pendiente y deja los efectos al día. */
function answer(http: HttpTestingController, recipes: readonly RecipeSummary[]): void {
  http.expectOne((request) => request.url.includes('/recipes')).flush(recipes);
  TestBed.tick();
}

describe('RecipeStore', () => {
  afterEach(() => vi.useRealTimers());

  it('mientras carga no afirma que el recetario esté vacío', () => {
    const { store, http } = setup();

    expect(store.loaded()).toBe(false);
    expect(store.isEmpty()).toBe(false);
    expect(store.loadingFirstTime()).toBe(true);

    answer(http, []);

    expect(store.loaded()).toBe(true);
    expect(store.isEmpty()).toBe(true);
    expect(store.loadingFirstTime()).toBe(false);
  });

  it('sin recetas en el segmento READY, el vacío es "ninguna lista", no el vacío general', () => {
    const { store, http } = setup();
    answer(http, []);

    store.availability.set('READY');
    TestBed.tick();
    answer(http, []);

    expect(store.isEmpty()).toBe(false);
    expect(store.noneReady()).toBe(true);
    expect(store.noneMissing()).toBe(false);
  });

  it('sin recetas en el segmento MISSING, el vacío es "ninguna con faltantes"', () => {
    const { store, http } = setup();
    answer(http, []);

    store.availability.set('MISSING');
    TestBed.tick();
    answer(http, []);

    expect(store.noneMissing()).toBe(true);
    expect(store.isEmpty()).toBe(false);
    expect(store.noneReady()).toBe(false);
  });

  it('sin resultados de búsqueda, el vacío es genérico sin importar el segmento', () => {
    vi.useFakeTimers();
    const { store, http } = setup();
    answer(http, []);

    store.availability.set('READY');
    TestBed.tick();
    answer(http, []);

    store.search.set('inexistente');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    TestBed.tick();
    answer(http, []);

    expect(store.noSearchMatches()).toBe(true);
    expect(store.noneReady()).toBe(false);
  });

  it('el segmento y la búsqueda viajan juntos como query params', () => {
    vi.useFakeTimers();
    const { store, http } = setup();
    answer(http, []);

    store.availability.set('READY');
    TestBed.tick();
    answer(http, []);

    store.search.set('tarta');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    TestBed.tick();

    const pedida = http.expectOne((request) => request.url.includes('/recipes'));
    expect(pedida.request.params.get('availability')).toBe('READY');
    expect(pedida.request.params.get('search')).toBe('tarta');
    pedida.flush([]);
  });

  it('el segmento ALL no manda el parámetro: es la ausencia de filtro', () => {
    const { store, http } = setup();
    const pedida = http.expectOne((request) => request.url.includes('/recipes'));
    expect(pedida.request.params.has('availability')).toBe(false);
    pedida.flush([]);
  });

  it('trae la disponibilidad y el recuento de faltantes ya calculados', () => {
    const { store, http } = setup();
    answer(http, [recipe('Tarta de manzana', 'MISSING', 2)]);

    expect(store.recipes()[0].availability).toBe('MISSING');
    expect(store.recipes()[0].missingCount).toBe(2);
  });

  it('al cambiar de hogar vuelve a «todavía no lo sé»', () => {
    const { store, http } = setup();
    answer(http, [recipe('Tarta de manzana')]);
    expect(store.recipes().length).toBe(1);

    householdId.set('otra-casa');
    TestBed.tick();

    expect(store.loaded()).toBe(false);
    expect(store.recipes()).toEqual([]);

    answer(http, [recipe('La otra')]);
    expect(store.recipes()[0].name).toBe('La otra');
  });

  it('quitar la búsqueda no toca el segmento activo', () => {
    vi.useFakeTimers();
    const { store, http } = setup();
    answer(http, []);

    store.availability.set('READY');
    TestBed.tick();
    answer(http, []);

    store.search.set('tarta');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    TestBed.tick();
    answer(http, []);

    store.clearSearch();
    TestBed.tick();

    const pedida = http.expectOne((request) => request.url.includes('/recipes'));
    expect(pedida.request.params.has('search')).toBe(false);
    expect(pedida.request.params.get('availability')).toBe('READY');
    pedida.flush([]);
  });

  it('un fallo no deja el flujo muerto: recargar vuelve a pedir', () => {
    const { store, http } = setup();

    http.expectOne((request) => request.url.includes('/recipes'))
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
    TestBed.tick();
    expect(store.hasError()).toBe(true);

    store.reload();
    TestBed.tick();

    answer(http, [recipe('Tarta de manzana')]);
    expect(store.hasError()).toBe(false);
    expect(store.recipes().length).toBe(1);
  });
});
