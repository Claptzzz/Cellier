import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { HouseholdContextService } from '../household/household-context.service';
import { ToastService } from '../toast/toast.service';
import { PantryStore } from './pantry-store';
import { WRITE_DEBOUNCE_MS } from './pantry-writes';
import type { PantryItem } from './pantry.models';

const householdId = signal<string | null>('casa');

function item(name: string, quantity: number, version = 0): PantryItem {
  return {
    id: name,
    product: { id: `p-${name}`, name, unit: 'UNIT' },
    quantity,
    parLevel: null,
    version,
  };
}

function setup(inicial: readonly PantryItem[] = [item('Huevos', 12)]) {
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
  const toasts = TestBed.inject(ToastService);
  TestBed.tick();
  http.expectOne((r) => r.url.includes('/pantry/items')).flush(inicial);
  TestBed.tick();
  return { store, http, toasts };
}

/** Deja correr el debounce y los microtareas de la cola. */
async function settle(): Promise<void> {
  vi.advanceTimersByTime(WRITE_DEBOUNCE_MS);
  TestBed.tick();
  await Promise.resolve();
  TestBed.tick();
}

const escrituras = (http: HttpTestingController) =>
  http.match((r) => r.method !== 'GET' && r.url.includes('/pantry/items'));

describe('Escrituras de la despensa', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('la cifra baja en el acto, antes de que salga nada', () => {
    const { store, http } = setup();

    store.nudge('Huevos', -1);
    TestBed.tick();

    // Sin esto, tocar −1 sería esperar a la red para mover un número: un gesto físico
    // convertido en trámite.
    expect(store.items()[0].quantity).toBe(11);
    expect(escrituras(http).length).toBe(0);
  });

  it('seis toques seguidos son UNA llamada con el neto', async () => {
    const { store, http } = setup();

    for (let i = 0; i < 6; i++) {
      store.nudge('Huevos', -1);
      vi.advanceTimersByTime(120);
      TestBed.tick();
    }
    expect(store.items()[0].quantity).toBe(6);

    await settle();
    const salidas = escrituras(http);
    expect(salidas.length).toBe(1);
    expect(salidas[0].request.url).toContain(':consume');
    expect(salidas[0].request.body).toEqual({ quantity: 6 });
    salidas[0].flush({ ...item('Huevos', 6, 1) });
  });

  it('tocar +1 y luego −1 no manda nada: no pasó nada que contar', async () => {
    const { store, http } = setup();

    store.nudge('Huevos', 1);
    TestBed.tick();
    store.nudge('Huevos', -1);
    TestBed.tick();

    await settle();
    // Un movimiento de cero ensuciaría la bitácora que explica la cantidad, y la base lo
    // rechaza por ck_stock_movements_sign.
    expect(escrituras(http).length).toBe(0);
    expect(store.items()[0].quantity).toBe(12);
  });

  it('un toque mientras vuelve la llamada anterior no hace saltar la cifra atrás', async () => {
    const { store, http } = setup();

    store.nudge('Huevos', -1);
    await settle();
    const primera = escrituras(http)[0];

    // Llega otro toque ANTES de que responda la primera.
    store.nudge('Huevos', -1);
    TestBed.tick();
    expect(store.items()[0].quantity).toBe(10);

    primera.flush(item('Huevos', 11, 1));
    TestBed.tick();

    // El servidor dice 11, pero aquí hay un toque sin mandar: 11 + (−1) = 10. Pisar con el
    // 11 pelado haría parpadear el número hacia atrás en la mano del usuario.
    expect(store.items()[0].quantity).toBe(10);
    expect(store.items()[0].version).toBe(1);
  });

  it('teclear mientras un toque va en vuelo manda la versión que deja ese toque', async () => {
    const { store, http } = setup([item('Huevos', 12, 0)]);

    store.nudge('Huevos', 1);
    await settle();
    const enVuelo = escrituras(http)[0];

    // El usuario abre el campo y escribe 20 ANTES de que vuelva su propio toque. Aquí la
    // versión que se ve sigue siendo la 0.
    store.setQuantity('Huevos', 20);
    TestBed.tick();
    expect(store.items()[0].version).toBe(0);

    // Vuelve el toque: la versión avanza a 1, y sólo entonces sale el PATCH de la fila.
    enVuelo.flush(item('Huevos', 13, 1));
    TestBed.tick();
    await Promise.resolve();
    TestBed.tick();

    const patch = escrituras(http)[0];
    expect(patch.request.method).toBe('PATCH');
    // Con la 0 —la que se veía al escribir— el servidor respondería 409 contra un cambio
    // del propio usuario. Por eso la versión se lee al salir, no al teclear.
    expect(patch.request.body).toEqual({ quantity: 20, version: 1 });
    patch.flush(item('Huevos', 20, 2));
  });

  it('escribir una cantidad descarta los toques que no habían salido', async () => {
    const { store, http } = setup();

    store.nudge('Huevos', -1);
    TestBed.tick();
    store.setQuantity('Huevos', 30);
    TestBed.tick();
    await settle();

    const salidas = escrituras(http);
    expect(salidas.length).toBe(1);
    expect(salidas[0].request.method).toBe('PATCH');
    salidas[0].flush(item('Huevos', 30, 1));
  });

  it('el 409 con datos corrige la fila y dice la cantidad que hay', async () => {
    const { store, http, toasts } = setup();

    store.setQuantity('Huevos', 12.5);
    TestBed.tick();
    await Promise.resolve();
    TestBed.tick();

    escrituras(http)[0].flush(
      {
        type: 'https://cellier.app/problems/conflict',
        title: 'Conflicto con el estado actual',
        detail: 'Otro miembro del hogar cambió este producto mientras lo editabas.',
        currentVersion: 7,
        currentQuantity: 4,
      },
      { status: 409, statusText: 'Conflict' });
    TestBed.tick();

    expect(store.items()[0].quantity).toBe(4);
    expect(store.items()[0].version).toBe(7);
    expect(toasts.toasts()[0].detail).toContain('Ahora hay 4');
    // Y no pide la lista otra vez: el cuerpo ya traía con qué corregirse.
    http.expectNone((r) => r.method === 'GET');
  });

  it('el 409 sin datos no afirma ninguna cantidad y recarga', async () => {
    const { store, http, toasts } = setup();

    store.setQuantity('Huevos', 12.5);
    TestBed.tick();
    await Promise.resolve();
    TestBed.tick();

    // Es el conflicto de dos transacciones a la vez: su transacción se deshizo, así que el
    // cuerpo no puede decir en qué quedó.
    escrituras(http)[0].flush(
      { title: 'Conflicto con el estado actual', detail: 'Otro miembro lo actualizó.' },
      { status: 409, statusText: 'Conflict' });
    TestBed.tick();

    expect(toasts.toasts()[0].detail).not.toMatch(/\d/);
    http.expectOne((r) => r.method === 'GET').flush([item('Huevos', 4, 7)]);
    TestBed.tick();
    expect(store.items()[0].quantity).toBe(4);
  });

  it('un fallo de red deshace lo que se había pintado', async () => {
    const { store, http, toasts } = setup();

    store.nudge('Huevos', -3);
    await settle();
    expect(store.items()[0].quantity).toBe(9);

    escrituras(http)[0].error(new ProgressEvent('error'), { status: 0, statusText: 'Offline' });
    TestBed.tick();

    expect(store.items()[0].quantity).toBe(12);
    expect(toasts.toasts()[0].title).toContain('No se pudo guardar');
  });

  it('salir de la pantalla manda lo que quedaba esperando', async () => {
    const { store, http } = setup();

    store.nudge('Huevos', -2);
    TestBed.tick();
    expect(escrituras(http).length).toBe(0);

    store.flushWrites();
    TestBed.tick();
    await Promise.resolve();
    TestBed.tick();

    const salidas = escrituras(http);
    expect(salidas.length).toBe(1);
    expect(salidas[0].request.body).toEqual({ quantity: 2 });
    salidas[0].flush(item('Huevos', 10, 1));
  });
});
