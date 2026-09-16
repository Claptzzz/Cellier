import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';

import { HouseholdContextService } from '../../core/household/household-context.service';
import type { TemplateReport } from '../../core/templates/report.models';
import { ReportPage } from './report-page';
import { reportAsText } from './report-text';

function item(name: string, category: string | undefined, desired: number, available: number) {
  const missing = Math.max(0, desired - available);
  return {
    productId: name, productName: name, unit: 'UNIT' as const, category,
    desiredQuantity: desired, availableQuantity: available, missingQuantity: missing,
    status: missing === 0 ? ('COMPLETE' as const) : ('MISSING' as const),
  };
}

const REPORTE: TemplateReport = {
  templateId: 't1',
  templateName: 'Compra semanal',
  generatedAt: '2026-09-15T14:30:00Z',
  summary: { totalItems: 5, missingItems: 3, completionRate: 0.4 },
  // Tal como llega del servidor: faltantes primero, por categoría, por nombre.
  items: [
    item('Huevos', 'Frescos', 10, 4),
    item('Leche entera', 'Frescos', 2, 0),
    item('Pan de molde', 'Panadería', 2, 0),
    item('Arroz grano largo', 'Despensa', 1000, 2500),
    item('Salsa de tomate', 'Despensa', 1000, 1000),
  ],
};

describe('ReportPage', () => {
  function render(reporte: TemplateReport = REPORTE) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: HouseholdContextService, useValue: { householdId: signal('casa') } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['templateId', 't1']]) } } },
      ],
    });
    const fixture = TestBed.createComponent(ReportPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne((r) => r.url.includes('/report')).flush(reporte);
    fixture.detectChanges();
    return { fixture, http, el: fixture.nativeElement as HTMLElement };
  }

  const textos = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

  it('cada línea dice lo que falta y lo que hay', () => {
    const { el } = render();

    // Las tres cifras que decide quien está en el pasillo.
    expect(textos(el)).toContain('Faltan 6 · tienes 4 de 10 un');
  });

  it('agrupa por categoría sin reordenar lo que mandó el servidor', () => {
    const { el } = render();

    const encabezados = [...el.querySelectorAll('h2')].map((h) => h.textContent?.trim());
    expect(encabezados).toEqual(['Frescos', 'Panadería']);

    // Los cubiertos no entran en los grupos: no se llevan al súper.
    const enGrupos = [...el.querySelectorAll('section li')].map((li) => li.textContent ?? '');
    expect(enGrupos.some((t) => t.includes('Arroz'))).toBe(false);
  });

  it('la barra de completitud dice EN PALABRAS qué mide', () => {
    const { el } = render();

    // Un porcentaje suelto se leería como nivel de existencias, que es la otra pregunta
    // del producto. Ver P2b.
    expect(textos(el)).toContain('2 de 5 productos cubiertos');
    expect(el.querySelector('ui-level-band')).toBeNull();
  });

  it('marcar una línea es local: no manda nada', () => {
    const { el, http, fixture } = render();

    const casilla = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
    casilla.click();
    fixture.detectChanges();

    http.expectNone(() => true);
    expect(casilla.checked).toBe(true);
  });

  it('lo ya cubierto va al final, plegado', () => {
    const { el } = render();

    const detalle = el.querySelector('details') as HTMLDetailsElement;
    expect(detalle.open).toBe(false);
    expect(detalle.textContent).toContain('Ya tienes 2 productos');
    expect(detalle.textContent).toContain('Arroz grano largo');
  });

  it('sin faltantes lo dice, sin barra de nada que comprar', () => {
    const { el } = render({
      ...REPORTE,
      summary: { totalItems: 2, missingItems: 0, completionRate: 1 },
      items: [item('Huevos', 'Frescos', 10, 12), item('Sal', undefined, 500, 500)],
    });

    expect(textos(el)).toContain('No falta nada');
    expect(el.querySelectorAll('section h2').length).toBe(0);
  });

  it('el reporte se pide fresco y no se cachea', () => {
    const { http, fixture } = render();

    // Volver a cargar la pantalla vuelve a preguntar: el sentido de la feature es que
    // refleje el stock de ahora mismo.
    (fixture.componentInstance as unknown as { load(): void }).load();
    http.expectOne((r) => r.url.includes('/report')).flush(REPORTE);
  });
});

describe('reportAsText', () => {
  it('lleva sólo lo que falta, agrupado como la pantalla', () => {
    const texto = reportAsText(REPORTE);

    expect(texto).toBe([
      'Compra semanal',
      '',
      'Frescos:',
      '- Huevos: 6 un',
      '- Leche entera: 2 un',
      '',
      'Panadería:',
      '- Pan de molde: 2 un',
    ].join('\n'));
  });

  it('cuando no falta nada, lo dice en una línea', () => {
    const texto = reportAsText({
      ...REPORTE,
      items: [item('Huevos', 'Frescos', 10, 12)],
    });

    expect(texto).toBe('Compra semanal\nNo falta nada.');
  });
});
