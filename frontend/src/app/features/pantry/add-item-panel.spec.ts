import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ViewportService } from '../../core/layout/viewport.service';
import { AddItemPanel } from './add-item-panel';

@Component({
  imports: [AddItemPanel],
  template: `
    <app-add-item-panel
      [open]="open()"
      householdId="casa"
      (added)="agregados.push($event)"
      (closed)="open.set(false)" />
  `,
})
class Host {
  readonly open = signal(true);
  readonly agregados: string[] = [];
}

const PRODUCTOS = [
  { id: 'p1', name: 'Leche entera', unit: 'L' as const, category: 'Nevera' },
  { id: 'p2', name: 'Leche de almendras', unit: 'L' as const },
];

describe('AddItemPanel', () => {
  function render() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // En escritorio se monta el diálogo; da igual cuál para lo que se prueba aquí.
        { provide: ViewportService, useValue: { isDesktop: signal(true) } },
      ],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, http, el, host: fixture.componentInstance };
  }

  /**
   * Teclea en un campo y espera a que el modelo se entere.
   *
   * El `await` no es decorativo: `ngModel` pasa el valor de la vista al modelo en una
   * microtarea, así que sin esperarla el componente sigue viendo el campo vacío y no se
   * dispara nada. Costó una sonda descubrirlo, porque el DOM sí mostraba lo tecleado.
   */
  async function escribir(el: HTMLElement, etiqueta: RegExp, texto: string): Promise<void> {
    const campos = [...el.querySelectorAll('ui-input')];
    const campo = campos.find((c) => etiqueta.test(c.textContent ?? ''));
    const input = campo?.querySelector('input') as HTMLInputElement;
    input.value = texto;
    input.dispatchEvent(new Event('input'));
    await Promise.resolve();
  }

  /**
   * Deja que el debounce del buscador corra.
   *
   * El `tick` ANTES de adelantar el reloj no es adorno: el flujo del buscador se alimenta de
   * una señal, y hasta que no se vacían los efectos no hay temporizador que adelantar.
   */
  function buscar(fixture: { detectChanges(): void }): void {
    fixture.detectChanges();
    TestBed.tick();
    vi.advanceTimersByTime(300);
    TestBed.tick();
  }

  function textos(el: HTMLElement): string {
    return (el.textContent ?? '').replace(/\s+/g, ' ');
  }

  it('busca en el catálogo al escribir y ofrece lo que ya conoce el hogar', async () => {
    vi.useFakeTimers();
    const { fixture, http, el } = render();

    await escribir(el, /Producto/, 'lech');
    buscar(fixture);

    const pedida = http.expectOne((r) => r.url.includes('/products'));
    expect(pedida.request.params.get('search')).toBe('lech');
    pedida.flush(PRODUCTOS);
    fixture.detectChanges();

    expect(textos(el)).toContain('Leche entera');
    expect(textos(el)).toContain('Leche de almendras');
    vi.useRealTimers();
  });

  it('elegir del catálogo fija la unidad y deja de preguntarla', async () => {
    vi.useFakeTimers();
    const { fixture, http, el } = render();

    await escribir(el, /Producto/, 'lech');
    buscar(fixture);
    http.expectOne((r) => r.url.includes('/products')).flush(PRODUCTOS);
    fixture.detectChanges();

    (el.querySelector('ul button') as HTMLButtonElement).click();
    fixture.detectChanges();

    // La unidad es parte de la identidad del producto: elegirlo la trae, y no hay selector
    // que invite a cambiarla.
    expect(textos(el)).toContain('Este hogar mide «Leche entera» en L');
    expect(el.querySelector('ui-select')).toBeNull();
    vi.useRealTimers();
  });

  it('con sugerencias en pantalla no dice a la vez que el nombre es nuevo', async () => {
    vi.useFakeTimers();
    const { fixture, http, el } = render();

    await escribir(el, /Producto/, 'leche');
    buscar(fixture);
    http.expectOne((r) => r.url.includes('/products')).flush(PRODUCTOS);
    fixture.detectChanges();

    // Listar tres coincidencias y decir que es nuevo son dos afirmaciones contrarias en la
    // misma pantalla. Mientras haya algo que elegir, no se pregunta la unidad.
    expect(textos(el)).toContain('Leche entera');
    expect(textos(el)).not.toContain('es nuevo en este hogar');
    expect(el.querySelector('ui-select')).toBeNull();
    vi.useRealTimers();
  });

  it('escribir el nombre exacto de algo que el hogar ya tiene ES elegirlo', async () => {
    vi.useFakeTimers();
    const { fixture, http, el, host } = render();

    await escribir(el, /Producto/, 'Leche entera');
    await escribir(el, /Cantidad/, '2');
    buscar(fixture);
    http.expectOne((r) => r.url.includes('/products')).flush(PRODUCTOS);
    fixture.detectChanges();

    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    // Si se tratara como producto nuevo iría con unidad UNIT y el servidor respondería 409
    // por un choque de unidades que el usuario no provocó.
    const alta = http.expectOne((r) => r.method === 'POST');
    expect(alta.request.body).toEqual({ productId: 'p1', quantity: 2 });
    alta.flush({ id: 'i1', product: PRODUCTOS[0], quantity: 2, parLevel: null, version: 0 });
    fixture.detectChanges();
    expect(host.agregados).toEqual(['Leche entera']);
    vi.useRealTimers();
  });

  it('un nombre que no existe pregunta en qué se mide, y avisa de que no se podrá cambiar', async () => {
    vi.useFakeTimers();
    const { fixture, http, el } = render();

    await escribir(el, /Producto/, 'Quinoa');
    buscar(fixture);
    http.expectOne((r) => r.url.includes('/products')).flush([]);
    fixture.detectChanges();

    expect(el.querySelector('ui-select')).not.toBeNull();
    expect(textos(el)).toContain('no se podrá cambiar después');
    vi.useRealTimers();
  });

  it('el choque de unidades se enseña donde está la causa, no en un toast', async () => {
    vi.useFakeTimers();
    const { fixture, http, el } = render();

    await escribir(el, /Producto/, 'Leche');
    await escribir(el, /Cantidad/, '2');
    buscar(fixture);
    http.expectOne((r) => r.url.includes('/products')).flush([]);
    fixture.detectChanges();

    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const detail = '«Leche» ya existe en este hogar medido en L, y lo estás enviando en G. '
      + 'Usa L, o crea un producto con otro nombre.';
    http.expectOne((r) => r.method === 'POST').flush(
      { status: 409, title: 'Conflicto con el estado actual', detail },
      { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    // El mensaje del servidor nombra las DOS unidades y ofrece la salida; reescribirlo aquí
    // se arriesgaría a que digan cosas distintas.
    expect(textos(el)).toContain('ya existe en este hogar medido en L');
    vi.useRealTimers();
  });

  it('si ya está en la despensa, lo dice y no lo agrega otra vez', async () => {
    vi.useFakeTimers();
    const { fixture, http, el, host } = render();

    await escribir(el, /Producto/, 'Lechuga');
    await escribir(el, /Cantidad/, '1');
    buscar(fixture);
    http.expectOne((r) => r.url.includes('/products')).flush([]);
    fixture.detectChanges();

    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    http.expectOne((r) => r.method === 'POST').flush(
      {
        status: 409,
        detail: '«Lechuga» ya está en la despensa. Usa reponer para sumar a lo que hay, '
          + 'o edítalo para corregir la cantidad.',
      },
      { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(textos(el)).toContain('ya está en la despensa');
    expect(host.agregados).toEqual([]);
    vi.useRealTimers();
  });

  it('no envía sin nombre ni sin cantidad', async () => {
    const { fixture, http, el } = render();

    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    http.expectNone((r) => r.method === 'POST');
    expect(textos(el)).toContain('Escribe qué quieres agregar');
  });

  it('cero es una cantidad válida: «lo tengo, y se me acabó»', async () => {
    vi.useFakeTimers();
    const { fixture, http, el, host } = render();

    await escribir(el, /Producto/, 'Quinoa');
    await escribir(el, /Cantidad/, '0');
    buscar(fixture);
    http.expectOne((r) => r.url.includes('/products')).flush([]);
    fixture.detectChanges();

    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const alta = http.expectOne((r) => r.method === 'POST');
    expect(alta.request.body).toEqual({ productName: 'Quinoa', unit: 'UNIT', quantity: 0 });
    alta.flush({ id: 'i1', product: { id: 'p9', name: 'Quinoa', unit: 'UNIT' },
      quantity: 0, parLevel: null, version: 0 });
    fixture.detectChanges();
    expect(host.agregados).toEqual(['Quinoa']);
    vi.useRealTimers();
  });
});
