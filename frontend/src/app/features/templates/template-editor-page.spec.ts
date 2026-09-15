import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';

import { HouseholdContextService } from '../../core/household/household-context.service';
import { ViewportService } from '../../core/layout/viewport.service';
import { ToastService } from '../../core/toast/toast.service';
import { TemplateEditorPage } from './template-editor-page';

const DETALLE = {
  id: 't1',
  name: 'Compra semanal',
  createdAt: '2026-08-24T15:00:00Z',
  updatedAt: '2026-09-02T11:20:00Z',
  items: [
    { id: 'i1', productId: 'p1', productName: 'Huevos', unit: 'UNIT', category: 'Frescos', desiredQuantity: 10 },
    { id: 'i2', productId: 'p2', productName: 'Salsa de tomate', unit: 'ML', category: 'Despensa', desiredQuantity: 1000 },
  ],
};

describe('TemplateEditorPage', () => {
  function render() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: HouseholdContextService, useValue: { householdId: signal('casa') } },
        { provide: ViewportService, useValue: { isDesktop: signal(true) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['templateId', 't1']]) } } },
      ],
    });
    const fixture = TestBed.createComponent(TemplateEditorPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne((r) => r.method === 'GET' && r.url.includes('/templates/t1')).flush(DETALLE);
    fixture.detectChanges();
    return {
      fixture,
      http,
      toasts: TestBed.inject(ToastService),
      page: fixture.componentInstance,
      el: fixture.nativeElement as HTMLElement,
    };
  }

  const textos = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

  function pulsar(el: HTMLElement, texto: string) {
    const boton = [...el.querySelectorAll('button')]
      .find((b) => (b.textContent ?? '').trim() === texto);
    (boton as HTMLButtonElement).click();
  }

  it('dice cuándo hay cambios sin guardar, en palabras', () => {
    const { page, fixture, el } = render();
    expect(textos(el)).toContain('Todo guardado');

    const store = (page as unknown as { store: { items(): { key: string }[]; setQuantity(k: string, v: number): void } }).store;
    store.setQuantity(store.items()[0].key, 12);
    fixture.detectChanges();

    // Texto y no un punto de color: «sin guardar» tiene que leerlo alguien que no conoce
    // la convención.
    expect(textos(el)).toContain('Cambios sin guardar');
  });

  it('salir sin cambios no pregunta nada', async () => {
    const { page } = render();
    await expect(page.askToLeave()).resolves.toBe(true);
  });

  it('salir con cambios pregunta, y respeta la respuesta', async () => {
    const { page, fixture, el } = render();
    const store = (page as unknown as { store: { items(): { key: string }[]; setQuantity(k: string, v: number): void } }).store;
    store.setQuantity(store.items()[0].key, 12);
    fixture.detectChanges();

    const seQueda = page.askToLeave();
    fixture.detectChanges();
    expect(textos(el)).toContain('todavía no se han guardado');

    pulsar(el, 'Seguir editando');
    await expect(seQueda).resolves.toBe(false);

    const seVa = page.askToLeave();
    fixture.detectChanges();
    pulsar(el, 'Salir sin guardar');
    await expect(seVa).resolves.toBe(true);
  });

  it('quitar una línea ofrece deshacer en el aviso, y deshacer la devuelve', () => {
    const { page, fixture, el, toasts } = render();
    const store = (page as unknown as {
      store: { items(): { key: string; productName: string }[] };
    }).store;

    (page as unknown as { remove(item: unknown): void }).remove(store.items()[0]);
    fixture.detectChanges();

    const aviso = toasts.toasts()[0];
    expect(aviso.title).toBe('Quitaste Huevos');
    expect(aviso.action?.label).toBe('Deshacer');
    expect(store.items().map((i) => i.productName)).toEqual(['Salsa de tomate']);

    toasts.run(aviso.id);
    fixture.detectChanges();
    expect(store.items().map((i) => i.productName)).toEqual(['Huevos', 'Salsa de tomate']);
    // Deshecho lo que fuera, el aviso ya no tiene nada que decir.
    expect(toasts.toasts().length).toBe(0);
  });

  it('sin cambios pendientes, el reporte es un enlace de verdad', () => {
    const { el } = render();

    const reporte = [...el.querySelectorAll('a, button')]
      .find((b) => (b.textContent ?? '').includes('Generar reporte')) as HTMLElement;
    // Enlace de verdad: se puede abrir en otra pestaña y el lector lo anuncia como enlace.
    // A dónde lleva lo decide el router, y comprobarlo aquí probaría la configuración de
    // rutas del test y no este botón.
    expect(reporte.tagName).toBe('A');
    expect(reporte.hasAttribute('href')).toBe(true);
  });

  it('con cambios sin guardar, el reporte no se puede pedir', () => {
    const { page, fixture, el } = render();
    const store = (page as unknown as { store: { items(): { key: string }[]; setQuantity(k: string, v: number): void } }).store;
    store.setQuantity(store.items()[0].key, 12);
    fixture.detectChanges();

    // El reporte se calcula contra lo GUARDADO. Dejarlo pulsar enseñaría un reporte de una
    // plantilla que ya no es la que el usuario tiene delante.
    //
    // Se comprueba que es INERTE, no que lo parezca: `aria-disabled` en un <a> sólo lo
    // anuncia, y el enlace sigue navegando con el ratón y con Enter.
    const reporte = [...el.querySelectorAll('a, button')]
      .find((b) => (b.textContent ?? '').includes('Generar reporte')) as HTMLElement;
    expect(reporte.tagName).toBe('BUTTON');
    expect((reporte as HTMLButtonElement).disabled).toBe(true);
  });
});
