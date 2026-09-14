import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { HouseholdContextService } from '../household/household-context.service';
import { PantryStore, SEARCH_DEBOUNCE_MS } from './pantry-store';
import type { PantryItem } from './pantry.models';

const householdId = signal<string | null>('casa');

function item(name: string, quantity: number, category?: string): PantryItem {
  return {
    id: name,
    product: { id: `p-${name}`, name, unit: 'UNIT', category },
    quantity,
    parLevel: null,
    version: 0,
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
  const store = TestBed.inject(PantryStore);
  const http = TestBed.inject(HttpTestingController);
  TestBed.tick();
  return { store, http };
}

/** Responde a la petición pendiente y deja los efectos al día. */
function answer(http: HttpTestingController, items: readonly PantryItem[]): void {
  http.expectOne((request) => request.url.includes('/pantry/items')).flush(items);
  TestBed.tick();
}

describe('PantryStore', () => {
  afterEach(() => vi.useRealTimers());

  it('mientras carga no afirma que la despensa esté vacía', () => {
    const { store, http } = setup();

    // Es la trampa de la sección 0: `[]` por defecto haría que `isEmpty` fuera cierto
    // desde el primer instante, y la pantalla diría «tu despensa está vacía» a alguien
    // cuyos datos vienen en camino.
    expect(store.loaded()).toBe(false);
    expect(store.isEmpty()).toBe(false);
    expect(store.loadingFirstTime()).toBe(true);

    answer(http, []);

    expect(store.loaded()).toBe(true);
    expect(store.isEmpty()).toBe(true);
    expect(store.loadingFirstTime()).toBe(false);
  });

  it('separa lo que hay de lo que se acabó, sin esconder nada', () => {
    const { store, http } = setup();
    answer(http, [item('Huevos', 12), item('Lechuga', 0), item('Salsa', 690)]);

    expect(store.available().map((i) => i.product.name)).toEqual(['Huevos', 'Salsa']);
    expect(store.gone().map((i) => i.product.name)).toEqual(['Lechuga']);
    expect(store.items().length).toBe(3);
  });

  it('escribir seis letras seguidas pide la lista una sola vez', () => {
    vi.useFakeTimers();
    const { store, http } = setup();
    answer(http, []);

    for (const text of ['l', 'le', 'lec', 'lech', 'lechu', 'lechuga']) {
      store.search.set(text);
      vi.advanceTimersByTime(40);
      TestBed.tick();
    }
    http.expectNone((request) => request.url.includes('/pantry/items'));

    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    TestBed.tick();

    const pedida = http.expectOne((request) => request.url.includes('/pantry/items'));
    expect(pedida.request.params.get('search')).toBe('lechuga');
    pedida.flush([]);
  });

  it('recargar con datos puestos no vuelve a los skeletons', () => {
    vi.useFakeTimers();
    const { store, http } = setup();
    answer(http, [item('Huevos', 12)]);

    store.search.set('hue');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    TestBed.tick();

    // La lista anterior sigue en pantalla mientras llega la nueva: cambiar a skeletons en
    // cada tecla haría parpadear la pantalla entera.
    expect(store.loadingFirstTime()).toBe(false);
    expect(store.refreshing()).toBe(true);
    expect(store.items().length).toBe(1);

    http.expectOne((request) => request.url.includes('/pantry/items')).flush([]);
  });

  it('las opciones de categoría no encogen al filtrar por una', () => {
    const { store, http } = setup();
    answer(http, [item('Huevos', 12, 'Nevera'), item('Salsa', 690, 'Despensa')]);
    expect(store.categories()).toEqual(['Despensa', 'Nevera']);

    store.category.set('Nevera');
    TestBed.tick();
    answer(http, [item('Huevos', 12, 'Nevera')]);

    // Si se derivaran de la respuesta actual, elegir «Nevera» dejaría «Nevera» como única
    // opción y no habría forma de volver a las demás desde el propio selector.
    expect(store.categories()).toEqual(['Despensa', 'Nevera']);
  });

  it('al cambiar de hogar vuelve a «todavía no lo sé», no enseña la despensa anterior', () => {
    const { store, http } = setup();
    answer(http, [item('Huevos', 12)]);
    expect(store.items().length).toBe(1);

    householdId.set('otra-casa');
    TestBed.tick();

    expect(store.loaded()).toBe(false);
    expect(store.items()).toEqual([]);
    expect(store.loadingFirstTime()).toBe(true);

    answer(http, [item('Palta', 3)]);
    expect(store.items().map((i) => i.product.name)).toEqual(['Palta']);
  });

  it('un fallo no deja el buscador muerto: el siguiente filtro vuelve a cargar', () => {
    vi.useFakeTimers();
    const { store, http } = setup();

    http.expectOne((request) => request.url.includes('/pantry/items'))
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
    TestBed.tick();
    expect(store.hasError()).toBe(true);

    // Con el error propagado hasta el suscriptor, el flujo quedaría cerrado y ningún
    // cambio posterior pediría nada: la pantalla se quedaría muerta hasta recargar.
    store.search.set('huevos');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    TestBed.tick();

    http.expectOne((request) => request.url.includes('/pantry/items')).flush([item('Huevos', 12)]);
    TestBed.tick();
    expect(store.hasError()).toBe(false);
    expect(store.items().length).toBe(1);
  });

  it('reload vuelve a pedir sin perder los filtros puestos', () => {
    vi.useFakeTimers();
    const { store, http } = setup();
    answer(http, [item('Huevos', 12)]);

    store.category.set('Nevera');
    TestBed.tick();
    answer(http, [item('Huevos', 12, 'Nevera')]);

    // Es lo que hace la pantalla al volver a entrar: otro miembro pudo cambiarla mientras
    // tanto. Volver a cargar no puede deshacer lo que el usuario dejó filtrado.
    store.reload();
    TestBed.tick();

    const pedida = http.expectOne((request) => request.url.includes('/pantry/items'));
    expect(pedida.request.params.get('category')).toBe('Nevera');
    pedida.flush([]);
  });

  it('quitar los filtros los quita de verdad, también el que ya viajó', () => {
    vi.useFakeTimers();
    const { store, http } = setup();
    answer(http, []);

    store.search.set('lechuga');
    store.category.set('Nevera');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    TestBed.tick();

    // Dos cambios seguidos dejan una sola petición viva: la anterior se cancela. Si no se
    // cancelara, una respuesta lenta podría llegar después de la buena y pintar la lista
    // del filtro que el usuario ya abandonó.
    const disparadas = http.match((request) => request.url.includes('/pantry/items'));
    expect(disparadas.filter((request) => request.cancelled).length).toBe(disparadas.length - 1);
    disparadas.filter((request) => !request.cancelled).forEach((request) => request.flush([]));
    TestBed.tick();
    expect(store.hasFilters()).toBe(true);
    expect(store.noMatches()).toBe(true);

    store.clearFilters();
    TestBed.tick();
    expect(store.hasFilters()).toBe(false);

    const pedida = http.expectOne((request) => request.url.includes('/pantry/items'));
    expect(pedida.request.params.has('search')).toBe(false);
    expect(pedida.request.params.has('category')).toBe(false);
    pedida.flush([]);
  });
});
