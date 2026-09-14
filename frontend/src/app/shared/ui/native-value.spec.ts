import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';

import { Input } from './input';
import { QuantityStepper } from './quantity-stepper';
import { Select } from './select';

/**
 * La misma prueba para todo lo que refleja una señal en un elemento nativo.
 *
 * <p>El fallo apareció por separado en `ui-input` y en `ui-quantity-stepper`, con dos PRs de
 * diferencia: el valor cambia desde fuera, la señal se entera y el elemento no. Se ve al
 * vaciar un formulario tras enviarlo, o al corregir una fila tras un conflicto: el control
 * sigue enseñando lo que ya nadie sostiene.
 *
 * <p>Esto es lo que ninguno de los tres puede volver a incumplir.
 */
@Component({
  imports: [FormsModule, Input, QuantityStepper, Select],
  template: `
    <ui-input
      label="Texto"
      [ngModelOptions]="{ standalone: true }"
      [ngModel]="texto()"
      (ngModelChange)="texto.set($event)" />

    <ui-select
      label="Elección"
      [options]="opciones"
      [ngModelOptions]="{ standalone: true }"
      [ngModel]="eleccion()"
      (ngModelChange)="eleccion.set($event)" />

    <ui-quantity-stepper [value]="cantidad()" unit="un" (changed)="cantidad.set($event.value)" />
  `,
})
class Host {
  readonly opciones = [
    { value: 'PANTRY', label: 'Alacena' },
    { value: 'FRIDGE', label: 'Refrigerador' },
  ];
  readonly texto = signal('escrito antes');
  readonly eleccion = signal('PANTRY');
  readonly cantidad = signal(12);
}

describe('Reflejo del valor en el elemento nativo', () => {
  /**
   * Deja que `ngModel` termine.
   *
   * Hacen falta DOS vueltas: `ngModel` aplaza el paso del modelo al control una microtarea,
   * y el reflejo en el elemento ocurre en la comprobación siguiente. Con una sola, el test
   * culparía al componente de algo que hace el formulario.
   */
  async function asentar(fixture: { detectChanges(): void }): Promise<void> {
    for (let vuelta = 0; vuelta < 2; vuelta++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  function render() {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      host: fixture.componentInstance,
      texto: el.querySelector('ui-input input') as HTMLInputElement,
      select: el.querySelector('ui-select select') as HTMLSelectElement,
      cantidad: el.querySelector('ui-quantity-stepper input') as HTMLInputElement,
    };
  }

  it('arrancan enseñando el valor que les dieron', async () => {
    const { fixture, texto, select, cantidad } = render();
    await asentar(fixture);
    expect(texto.value).toBe('escrito antes');
    expect(select.value).toBe('PANTRY');
    expect(cantidad.value).toBe('12');
  });

  describe('cuando el valor cambia desde fuera', () => {
    it('ui-input lo refleja', async () => {
      const { fixture, host, texto } = render();
      await asentar(fixture);
      host.texto.set('corregido desde el servidor');
      await asentar(fixture);
      expect(texto.value).toBe('corregido desde el servidor');
    });

    it('ui-select lo refleja', async () => {
      const { fixture, host, select } = render();
      await asentar(fixture);
      host.eleccion.set('FRIDGE');
      await asentar(fixture);
      expect(select.value).toBe('FRIDGE');
    });

    it('ui-quantity-stepper lo refleja', async () => {
      const { fixture, host, cantidad } = render();
      await asentar(fixture);
      host.cantidad.set(4);
      await asentar(fixture);
      expect(cantidad.value).toBe('4');
    });
  });

  describe('cuando se vacía o se vuelve al valor de antes', () => {
    it('ui-input no se queda con lo que el usuario había tecleado', async () => {
      const { fixture, host, texto } = render();

      // Teclear y que el modelo vuelva a lo mismo de antes en la misma vuelta: es lo que
      // pasa al reiniciar un formulario tras enviarlo, y el enlace no ve ningún cambio.
      await asentar(fixture);
      texto.value = 'a medio escribir';
      texto.dispatchEvent(new Event('input'));
      await asentar(fixture);
      host.texto.set('');
      await asentar(fixture);

      expect(texto.value).toBe('');
    });

    it('ui-quantity-stepper no se queda con un texto que no es número', async () => {
      const { fixture, cantidad } = render();
      await asentar(fixture);

      cantidad.dispatchEvent(new Event('focus'));
      cantidad.value = 'dos docenas';
      cantidad.dispatchEvent(new Event('input'));
      cantidad.dispatchEvent(new Event('blur'));
      fixture.detectChanges();

      expect(cantidad.value).toBe('12');
    });
  });
});
