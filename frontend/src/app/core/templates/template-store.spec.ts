import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { HouseholdContextService } from '../household/household-context.service';
import { TemplateStore } from './template-store';
import type { TemplateSummary } from './template.models';

const householdId = signal<string | null>('casa');

function template(name: string, itemCount = 0, createdByName?: string): TemplateSummary {
  return {
    id: name,
    name,
    itemCount,
    createdByName,
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
  const store = TestBed.inject(TemplateStore);
  const http = TestBed.inject(HttpTestingController);
  TestBed.tick();
  return { store, http };
}

const pendiente = (http: HttpTestingController) =>
  http.expectOne((r) => r.url.includes('/templates'));

describe('TemplateStore', () => {
  it('mientras carga no afirma que el hogar no tenga plantillas', () => {
    const { store, http } = setup();

    // `[]` por defecto haría que el estado vacío —con su explicación de para qué sirven—
    // apareciera antes de saber si hay alguna.
    expect(store.loaded()).toBe(false);
    expect(store.isEmpty()).toBe(false);
    expect(store.loadingFirstTime()).toBe(true);

    pendiente(http).flush([]);
    TestBed.tick();

    expect(store.isEmpty()).toBe(true);
    expect(store.loadingFirstTime()).toBe(false);
  });

  it('trae lo que la lista necesita, incluido quién la creó', () => {
    const { store, http } = setup();
    pendiente(http).flush([template('Compra semanal', 12, 'Ana Rivas')]);
    TestBed.tick();

    expect(store.templates()[0].itemCount).toBe(12);
    expect(store.templates()[0].createdByName).toBe('Ana Rivas');
  });

  it('al cambiar de hogar vuelve a «todavía no lo sé»', () => {
    const { store, http } = setup();
    pendiente(http).flush([template('Compra semanal')]);
    TestBed.tick();
    expect(store.templates().length).toBe(1);

    householdId.set('otra-casa');
    TestBed.tick();

    expect(store.loaded()).toBe(false);
    expect(store.templates()).toEqual([]);
    pendiente(http).flush([template('La otra')]);
    TestBed.tick();
    expect(store.templates()[0].name).toBe('La otra');
  });

  it('un fallo no deja el flujo muerto: recargar vuelve a pedir', () => {
    const { store, http } = setup();

    pendiente(http).error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
    TestBed.tick();
    expect(store.hasError()).toBe(true);

    store.reload();
    TestBed.tick();

    pendiente(http).flush([template('Compra semanal')]);
    TestBed.tick();
    expect(store.hasError()).toBe(false);
    expect(store.templates().length).toBe(1);
  });
});
