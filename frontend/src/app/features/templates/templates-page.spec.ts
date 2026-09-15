import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { HouseholdContextService } from '../../core/household/household-context.service';
import { ViewportService } from '../../core/layout/viewport.service';
import { ToastService } from '../../core/toast/toast.service';
import type { TemplateSummary } from '../../core/templates/template.models';
import { TemplatesPage } from './templates-page';

const householdId = signal<string | null>('casa');

function template(id: string, name: string, itemCount = 0, createdByName?: string): TemplateSummary {
  return {
    id, name, itemCount, createdByName,
    createdAt: '2026-08-24T15:00:00Z',
    updatedAt: '2026-09-02T11:20:00Z',
  };
}

describe('TemplatesPage', () => {
  function render(iniciales: readonly TemplateSummary[]) {
    TestBed.resetTestingModule();
    householdId.set('casa');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: HouseholdContextService, useValue: { householdId } },
        { provide: ViewportService, useValue: { isDesktop: signal(true) } },
      ],
    });
    const fixture = TestBed.createComponent(TemplatesPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne((r) => r.url.includes('/templates') && r.method === 'GET').flush(iniciales);
    fixture.detectChanges();
    return {
      fixture,
      http,
      toasts: TestBed.inject(ToastService),
      page: fixture.componentInstance as unknown as {
        askName(intent: string, t?: TemplateSummary): void;
        confirm(householdId: string, name: string): void;
        initialName(): string;
        subtitle(t: TemplateSummary): string;
      },
      el: fixture.nativeElement as HTMLElement,
    };
  }

  const textos = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

  it('el vacío explica para qué sirve con un ejemplo concreto', () => {
    const { el } = render([]);

    // Quien llega por primera vez no sabe qué es una plantilla, y «lista recurrente» no se
    // lo dice. El ejemplo tiene cantidades que alguien reconoce.
    expect(textos(el)).toContain('Huevos');
    expect(textos(el)).toContain('10 un');
    expect(textos(el)).toContain('faltan 6');
  });

  it('cada fila dice cuántos productos tiene y quién la escribió', () => {
    const { page } = render([]);

    expect(page.subtitle(template('t1', 'Compra semanal', 12, 'Ana Rivas')))
      .toBe('12 productos · Ana Rivas');
    expect(page.subtitle(template('t2', 'Asado', 1)))
      .toBe('1 producto');
  });

  it('duplicar lee el detalle y crea otra con las mismas líneas', () => {
    const { page, http, fixture } = render([template('t1', 'Compra semanal', 2)]);

    page.askName('duplicate', template('t1', 'Compra semanal', 2));
    fixture.detectChanges();
    page.confirm('casa', 'Compra semanal (copia)');

    // No hay endpoint de duplicar y no hacía falta: la API ya permite crear con líneas.
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/templates/t1')).flush({
      id: 't1', name: 'Compra semanal', createdAt: '', updatedAt: '',
      items: [
        { id: 'i1', productId: 'p1', productName: 'Huevos', unit: 'UNIT', desiredQuantity: 10 },
        { id: 'i2', productId: 'p2', productName: 'Salsa', unit: 'ML', desiredQuantity: 1000 },
      ],
    });

    const alta = http.expectOne((r) => r.method === 'POST');
    expect(alta.request.body).toEqual({
      name: 'Compra semanal (copia)',
      items: [
        { productId: 'p1', desiredQuantity: 10 },
        { productId: 'p2', desiredQuantity: 1000 },
      ],
    });
  });

  it('el nombre propuesto al duplicar no choca con uno que ya existe', () => {
    const { page, fixture } = render([
      template('t1', 'Compra semanal'),
      template('t2', 'Compra semanal (copia)'),
    ]);

    page.askName('duplicate', template('t1', 'Compra semanal'));
    fixture.detectChanges();

    // El hogar no admite dos nombres iguales. Proponer uno ya usado obligaría a descubrir el
    // choque pulsando, que es enterarse tarde de algo que se sabía antes.
    expect(page.initialName()).toBe('Compra semanal (copia 2)');
  });

  it('un nombre repetido se enseña en el diálogo, no en un toast que lo tape', () => {
    const { page, http, fixture, el, toasts } = render([template('t1', 'Compra semanal')]);

    page.askName('create');
    fixture.detectChanges();
    page.confirm('casa', 'compra semanal');

    http.expectOne((r) => r.method === 'POST').flush(
      { detail: 'Ya hay una plantilla llamada «Compra semanal» en este hogar. Usa otro nombre, o edita la que ya existe.' },
      { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(textos(el)).toContain('Ya hay una plantilla llamada');
    expect(toasts.toasts().length).toBe(0);
  });
});
