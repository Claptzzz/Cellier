import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ViewportService } from '../../core/layout/viewport.service';
import type { PantryItem } from '../../core/pantry/pantry.models';
import { RestockRunPanel } from './restock-run-panel';

function item(id: string, name: string, quantity: number): PantryItem {
  return {
    id,
    product: { id: `p-${id}`, name, unit: 'UNIT' },
    quantity,
    parLevel: null,
    version: 0,
  };
}

const DESPENSA = [item('i1', 'Huevos', 4), item('i2', 'Leche entera', 1), item('i3', 'Lechuga', 2)];

@Component({
  imports: [RestockRunPanel],
  template: `
    <app-restock-run-panel
      [open]="true"
      [items]="items"
      (restocked)="sumas.push($event)"
      (closed)="cerrado.set(true)" />
  `,
})
class Host {
  readonly items = DESPENSA;
  readonly sumas: { itemId: string; amount: number }[] = [];
  readonly cerrado = signal(false);
}

describe('RestockRunPanel', () => {
  function render() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ViewportService, useValue: { isDesktop: signal(true) } }],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  async function buscar(fixture: { detectChanges(): void }, el: HTMLElement, texto: string) {
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = texto;
    input.dispatchEvent(new Event('input'));
    await Promise.resolve();
    fixture.detectChanges();
  }

  function pulsar(el: HTMLElement, texto: string | RegExp) {
    const botones = [...el.querySelectorAll('button')];
    const boton = botones.find((b) => {
      const t = (b.textContent ?? '').trim();
      return typeof texto === 'string' ? t === texto : texto.test(t);
    });
    (boton as HTMLButtonElement).click();
  }

  function textos(el: HTMLElement): string {
    return (el.textContent ?? '').replace(/\s+/g, ' ');
  }

  it('filtra en memoria lo que ya está en la despensa', async () => {
    const { fixture, el } = render();
    await buscar(fixture, el, 'lech');

    // Sin ida y vuelta al servidor: la despensa entera ya está cargada, y quien vacía una
    // bolsa en la cocina teclea rápido.
    expect(textos(el)).toContain('Leche entera');
    expect(textos(el)).toContain('Lechuga');
    expect(textos(el)).not.toContain('Huevos');
  });

  it('sumar deja el panel abierto y listo para el siguiente', async () => {
    const { fixture, el, host } = render();
    await buscar(fixture, el, 'huevos');
    pulsar(el, /Huevos/);
    fixture.detectChanges();
    pulsar(el, 'Sumar');
    fixture.detectChanges();

    expect(host.sumas).toEqual([{ itemId: 'i1', amount: 1 }]);
    expect(host.cerrado()).toBe(false);
    // Y el campo vuelve a estar vacío: el siguiente producto se teclea sin borrar nada.
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('');
    expect(textos(el)).toContain('Ya guardaste');
  });

  it('sumar dos veces el mismo producto es una línea con el total', async () => {
    const { fixture, el, host } = render();
    for (const vez of [1, 2]) {
      await buscar(fixture, el, 'huevos');
      pulsar(el, /Huevos/);
      fixture.detectChanges();
      pulsar(el, 'Sumar');
      fixture.detectChanges();
      expect(host.sumas.length).toBe(vez);
    }

    // Dos cartones de huevos son «+2», no dos entradas que haya que sumar de cabeza.
    pulsar(el, 'Terminar');
    fixture.detectChanges();
    expect(textos(el)).toContain('Guardaste 1 producto.');
    expect(textos(el)).toContain('+2');
  });

  it('al terminar resume lo guardado y sólo entonces se cierra', async () => {
    const { fixture, el, host } = render();
    await buscar(fixture, el, 'huevos');
    pulsar(el, /Huevos/);
    fixture.detectChanges();
    pulsar(el, 'Sumar');
    fixture.detectChanges();
    await buscar(fixture, el, 'lechuga');
    pulsar(el, /Lechuga/);
    fixture.detectChanges();
    pulsar(el, 'Sumar');
    fixture.detectChanges();

    pulsar(el, 'Terminar');
    fixture.detectChanges();
    expect(textos(el)).toContain('Guardaste 2 productos.');
    expect(host.cerrado()).toBe(false);

    pulsar(el, 'Listo');
    expect(host.cerrado()).toBe(true);
  });

  it('sin haber sumado nada, el botón cierra en vez de resumir', () => {
    const { fixture, el, host } = render();
    pulsar(el, 'Cancelar');
    fixture.detectChanges();

    // Un resumen vacío es una pantalla que no dice nada y hay que cerrar dos veces.
    expect(host.cerrado()).toBe(true);
    expect(textos(el)).not.toContain('Guardaste');
  });

  it('lo que no está en la despensa se manda al flujo que sí lo crea', async () => {
    const { fixture, el } = render();
    await buscar(fixture, el, 'quinoa');

    expect(textos(el)).toContain('No tienes nada así en la despensa');
    expect(textos(el)).toContain('Agregar producto');
  });
});
