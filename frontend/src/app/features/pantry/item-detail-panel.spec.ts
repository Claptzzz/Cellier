import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ViewportService } from '../../core/layout/viewport.service';
import type { PantryItem, StockMovement } from '../../core/pantry/pantry.models';
import { ItemDetailPanel } from './item-detail-panel';

const HOY = new Date(2026, 8, 14, 12, 0);

function item(id: string, name: string): PantryItem {
  return {
    id,
    product: { id: `p-${id}`, name, unit: 'UNIT' },
    quantity: 6,
    parLevel: 12,
    version: 3,
  };
}

function movement(id: string, delta: number, quien?: string): StockMovement {
  return {
    id,
    type: delta > 0 ? 'PURCHASE' : 'CONSUMPTION',
    delta,
    performedAt: '2026-09-13T18:30:00Z',
    performedByName: quien,
  };
}

@Component({
  imports: [ItemDetailPanel],
  template: `
    <app-item-detail-panel
      [open]="true"
      householdId="casa"
      [item]="actual()"
      [today]="hoy" />
  `,
})
class Host {
  readonly actual = signal<PantryItem | null>(item('i1', 'Huevos'));
  readonly hoy = HOY;
}

describe('ItemDetailPanel', () => {
  function render() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ViewportService, useValue: { isDesktop: signal(true) } },
      ],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return {
      fixture,
      host: fixture.componentInstance,
      http: TestBed.inject(HttpTestingController),
      el: fixture.nativeElement as HTMLElement,
    };
  }

  const textos = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

  function pulsar(el: HTMLElement, texto: string) {
    const boton = [...el.querySelectorAll('button')]
      .find((b) => (b.textContent ?? '').trim() === texto);
    (boton as HTMLButtonElement).click();
  }

  it('pide la bitácora al abrirse, no al cargar la lista', () => {
    const { http, fixture, el } = render();

    const pedida = http.expectOne((r) => r.url.includes('/movements'));
    expect(pedida.request.params.get('page')).toBe('0');
    pedida.flush({
      content: [movement('m1', -2, 'Bruno Soto'), movement('m2', 12, 'Ana Rivas')],
      page: 0, size: 10, totalElements: 2, totalPages: 1,
    });
    fixture.detectChanges();

    expect(textos(el)).toContain('Se gastó · Bruno Soto');
    expect(textos(el)).toContain('−2');
    expect(textos(el)).toContain('Se agregó · Ana Rivas');
    expect(textos(el)).toContain('+12');
  });

  it('trae más páginas sin perder las anteriores', () => {
    const { http, fixture, el } = render();
    http.expectOne((r) => r.url.includes('/movements')).flush({
      content: [movement('m1', -2)], page: 0, size: 10, totalElements: 2, totalPages: 2,
    });
    fixture.detectChanges();

    pulsar(el, 'Ver más');
    fixture.detectChanges();

    const segunda = http.expectOne((r) => r.url.includes('/movements'));
    expect(segunda.request.params.get('page')).toBe('1');
    segunda.flush({
      content: [movement('m2', 12)], page: 1, size: 10, totalElements: 2, totalPages: 2,
    });
    fixture.detectChanges();

    expect(el.querySelectorAll('li').length).toBe(2);
    // Con todo traído, ya no hay más que pedir.
    expect(textos(el)).not.toContain('Ver más');
  });

  it('al cambiar de artículo no enseña el historial del anterior', () => {
    const { http, fixture, el, host } = render();
    http.expectOne((r) => r.url.includes('/movements')).flush({
      content: [movement('m1', -2, 'Bruno Soto')], page: 0, size: 10, totalElements: 1, totalPages: 1,
    });
    fixture.detectChanges();
    expect(textos(el)).toContain('Bruno Soto');

    host.actual.set(item('i2', 'Lechuga'));
    fixture.detectChanges();

    // En el hueco entre abrir y responder, el historial de los huevos bajo el nombre de la
    // lechuga sería una mentira que además cuadra: son movimientos de verdad, de otra cosa.
    expect(textos(el)).not.toContain('Bruno Soto');
    const segunda = http.expectOne((r) => r.url.includes('/movements'));
    expect(segunda.request.url).toContain('/i2/movements');
    segunda.flush({ content: [], page: 0, size: 10, totalElements: 0, totalPages: 0 });
  });

  it('un artículo sin movimientos lo dice, no se queda en blanco', () => {
    const { http, fixture, el } = render();
    http.expectOne((r) => r.url.includes('/movements')).flush({
      content: [], page: 0, size: 10, totalElements: 0, totalPages: 0,
    });
    fixture.detectChanges();

    expect(textos(el)).toContain('Todavía no hay movimientos');
  });

  it('si la bitácora falla, el resto del detalle sigue en pie', () => {
    const { http, fixture, el } = render();
    http.expectOne((r) => r.url.includes('/movements'))
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // La cantidad y el vencimiento ya estaban; perder el historial no puede llevárselos.
    expect(textos(el)).toContain('No pudimos traer el historial');
    expect(textos(el)).toContain('de 12');
  });
});
