import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TemplateEditorStore } from './template-editor-store';
import type { CatalogProduct, TemplateDetail } from './template.models';

const HUEVOS: CatalogProduct = { id: 'p1', name: 'Huevos', unit: 'UNIT', category: 'Frescos' };
const SALSA: CatalogProduct = { id: 'p2', name: 'Salsa de tomate', unit: 'ML', category: 'Despensa' };

function detail(items: { id: string; productId: string; name: string; qty: number }[]): TemplateDetail {
  return {
    id: 't1',
    name: 'Compra semanal',
    createdAt: '2026-08-24T15:00:00Z',
    updatedAt: '2026-09-02T11:20:00Z',
    items: items.map((i) => ({
      id: i.id, productId: i.productId, productName: i.name, unit: 'UNIT', desiredQuantity: i.qty,
    })),
  };
}

function setup(inicial = detail([{ id: 'i1', productId: 'p1', name: 'Huevos', qty: 10 }])) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), TemplateEditorStore],
  });
  const store = TestBed.inject(TemplateEditorStore);
  const http = TestBed.inject(HttpTestingController);
  store.load('casa', 't1');
  http.expectOne((r) => r.method === 'GET').flush(inicial);
  return { store, http };
}

describe('TemplateEditorStore', () => {
  it('recién cargada no hay nada que guardar', () => {
    const { store } = setup();

    expect(store.loaded()).toBe(true);
    expect(store.isDirty()).toBe(false);
    expect(store.items().length).toBe(1);
  });

  it('cambiar una cantidad ensucia; devolverla la deja limpia otra vez', () => {
    const { store } = setup();
    const key = store.items()[0].key;

    store.setQuantity(key, 12);
    expect(store.isDirty()).toBe(true);

    // Se compara contenido, no referencias. Avisar de cambios pendientes que ya no existen
    // enseña a ignorar el aviso, y entonces no sirve el día que sí hay algo que perder.
    store.setQuantity(key, 10);
    expect(store.isDirty()).toBe(false);
  });

  it('añadir y quitar el mismo producto deja la plantilla como estaba', () => {
    const { store } = setup();

    store.add(SALSA, 500);
    expect(store.isDirty()).toBe(true);

    const quitado = store.remove(store.items()[1].key);
    expect(store.isDirty()).toBe(false);
    expect(quitado?.item.productName).toBe('Salsa de tomate');
  });

  it('deshacer devuelve la línea a SU sitio, no al final', () => {
    const { store } = setup(detail([
      { id: 'i1', productId: 'p1', name: 'Huevos', qty: 10 },
      { id: 'i2', productId: 'p2', name: 'Salsa', qty: 500 },
      { id: 'i3', productId: 'p3', name: 'Arroz', qty: 1000 },
    ]));

    const quitado = store.remove(store.items()[1].key)!;
    expect(store.items().map((i) => i.productName)).toEqual(['Huevos', 'Arroz']);

    store.restore(quitado.item, quitado.index);

    // Una lista que se reordena sola al deshacer no es la que había antes.
    expect(store.items().map((i) => i.productName)).toEqual(['Huevos', 'Salsa', 'Arroz']);
    expect(store.isDirty()).toBe(false);
  });

  it('el mismo producto no entra dos veces', () => {
    const { store } = setup();

    store.add(HUEVOS, 5);

    // Dos líneas del mismo producto son dos deseos sobre lo mismo, y el servidor las rechaza.
    expect(store.items().length).toBe(1);
    expect(store.isDirty()).toBe(false);
  });

  it('guardar manda la lista entera y deja de haber cambios pendientes', () => {
    const { store, http } = setup();
    store.add(SALSA, 500);
    store.save();

    const guardado = http.expectOne((r) => r.method === 'PUT');
    expect(guardado.request.body).toEqual({
      items: [
        { productId: 'p1', desiredQuantity: 10 },
        { productId: 'p2', desiredQuantity: 500 },
      ],
    });

    guardado.flush(detail([
      { id: 'i1', productId: 'p1', name: 'Huevos', qty: 10 },
      { id: 'i9', productId: 'p2', name: 'Salsa de tomate', qty: 500 },
    ]));
    expect(store.isDirty()).toBe(false);
  });

  it('si guardar falla, lo editado NO se pierde', () => {
    const { store, http } = setup();
    store.add(SALSA, 500);
    store.save();

    http.expectOne((r) => r.method === 'PUT').flush(
      { detail: 'La lista trae 1 producto(s) que no son del catálogo de este hogar.' },
      { status: 400, statusText: 'Bad Request' });

    // Vaciar el borrador al fallar castigaría al usuario por un error del servidor.
    expect(store.items().length).toBe(2);
    expect(store.isDirty()).toBe(true);
    expect(store.error()).toContain('no son del catálogo');
  });
});
