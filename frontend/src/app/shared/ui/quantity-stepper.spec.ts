import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { QuantityStepper } from './quantity-stepper';
import type { QuantityChange } from './quantity-stepper';

@Component({
  imports: [QuantityStepper],
  template: `
    <ui-quantity-stepper
      [value]="value()"
      [step]="step()"
      unit="un"
      (changed)="onChange($event)" />
  `,
})
class Host {
  readonly value = signal(12);
  readonly step = signal(1);
  readonly changes: QuantityChange[] = [];
  onChange(change: QuantityChange): void {
    this.changes.push(change);
    this.value.set(change.value);
  }
}

describe('QuantityStepper', () => {
  function render() {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      host: fixture.componentInstance,
      input: el.querySelector('input') as HTMLInputElement,
      menos: el.querySelector('button') as HTMLButtonElement,
      mas: el.querySelectorAll('button')[1] as HTMLButtonElement,
    };
  }

  function escribir(input: HTMLInputElement, texto: string) {
    input.dispatchEvent(new Event('focus'));
    input.value = texto;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
  }

  it('un toque dice cuánto movió, no sólo dónde quedó', () => {
    const { host, menos, fixture } = render();
    menos.click();
    fixture.detectChanges();

    // El delta es lo que distingue un movimiento relativo, que compone con el de otro
    // miembro, de un valor absoluto que hay que defender con una versión.
    expect(host.changes).toEqual([{ value: 11, delta: -1 }]);
  });

  it('un número escrito a mano no lleva delta: es absoluto', () => {
    const { host, input, fixture } = render();
    escribir(input, '20');
    fixture.detectChanges();

    expect(host.changes).toEqual([{ value: 20, delta: null }]);
  });

  it('acepta la coma decimal, que es lo que se teclea en es-CL', () => {
    const { host, input, fixture } = render();
    escribir(input, '0,5');
    fixture.detectChanges();

    expect(host.changes).toEqual([{ value: 0.5, delta: null }]);
  });

  it('lo que pinta se puede volver a teclear sin cambiar de valor', () => {
    const { host, input, fixture } = render();
    host.value.set(1500);
    fixture.detectChanges();

    // Si el campo escribiera «1.500», este mismo texto volvería a entrar por commit y el
    // punto se leería como decimal: 1500 g de arroz pasarían a 1,5.
    expect(input.value).toBe('1500');
    escribir(input, input.value);
    fixture.detectChanges();
    expect(host.changes).toEqual([]);
  });

  it('un valor que cambia desde fuera se refleja en el campo', () => {
    const { host, input, fixture } = render();
    // Es lo que pasa cuando el servidor corrige un conflicto: la fila vuelve a la cantidad
    // real y el control no puede quedarse enseñando la que ya nadie sostiene.
    host.value.set(4);
    fixture.detectChanges();

    expect(input.value).toBe('4');
  });

  it('un texto que no es número deja el valor como estaba', () => {
    const { host, input, fixture } = render();
    escribir(input, 'dos docenas');
    fixture.detectChanges();

    expect(host.changes).toEqual([]);
    expect(input.value).toBe('12');
  });

  it('no baja del mínimo: el menos se apaga en cero', () => {
    const { host, menos, fixture } = render();
    host.value.set(0);
    fixture.detectChanges();

    expect(menos.disabled).toBe(true);
  });
});
