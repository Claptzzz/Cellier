import {
  ChangeDetectionStrategy, Component, ElementRef, effect, input, output, signal, viewChild,
} from '@angular/core';

import { Icon } from './icon';

let nextId = 0;

/**
 * Un cambio de cantidad, diciendo CÓMO se hizo.
 *
 * `delta` distingue las dos clases de escritura que la API trata distinto: un toque en −/+ es
 * un movimiento relativo que compone con el de cualquier otro miembro, y un número tecleado
 * es un valor absoluto que depende de lo que quien lo escribió tenía delante. Sin esta
 * distinción en el evento, quien lo escuche tendría que adivinarla.
 */
export interface QuantityChange {
  /** La cantidad resultante. */
  readonly value: number;
  /** Cuánto se sumó o restó, o `null` si el número se escribió a mano. */
  readonly delta: number | null;
}

/**
 * Ajuste de cantidad pensado para usarse con UNA MANO, de pie frente a la despensa.
 *
 * Los botones son de 48px, por encima del mínimo de 44, porque este es el control
 * que más se toca en toda la app y suele accionarse sin mirar.
 *
 * El valor central es editable: teclear "12" es más rápido que pulsar doce veces.
 * Ese campo es un input real, así que le aplica la regla de 16px.
 */
@Component({
  selector: 'ui-quantity-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div
      class="inline-flex max-w-full items-stretch rounded-md border border-border-strong bg-surface-raised"
      role="group"
      [attr.aria-label]="label()">

      <button
        type="button"
        class="flex h-12 w-12 flex-none items-center justify-center rounded-l-md text-text
               transition-colors duration-150
               hover:bg-surface-sunken active:bg-surface-sunken
               focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent
               disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        [disabled]="disabled() || value() <= min()"
        [attr.aria-label]="'Quitar ' + step() + ' ' + unit()"
        (click)="nudge(-step())">
        <ui-icon name="minus" [size]="20" />
      </button>

      <!-- Ancho FIJO, no flexible. Con flex-1 el centro crece hasta donde le dejen, y dentro
           de una fila de lista eso significa un stepper del ancho de la pantalla: el control
           deja de leerse como un control y la fila se va a 157px de alto.

           Encoger sí: a 200% de zoom el viewport se queda en 188px y el centro tiene que
           ceder para que los botones, que no pueden bajar de 44, sigan cabiendo. Por eso es
           un TOPE y no un ancho fijo: fijarlo desbordaba 2px a ese zoom. -->
      <div class="flex min-w-0 max-w-[84px] flex-1 basis-[84px] flex-col items-center justify-center border-x border-border px-1.5">
        <input
          #campo
          [id]="id"
          type="text"
          inputmode="decimal"
          [attr.aria-label]="label()"
          [disabled]="disabled()"
          [value]="draft()"
          class="w-full bg-transparent text-center font-mono font-medium text-text
                 text-[length:var(--text-control)]
                 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent
                 disabled:opacity-45"
          (input)="onType($event)"
          (focus)="onFocus()"
          (blur)="commit()"
          (keydown.enter)="commit()" />
        <span class="text-[11px] leading-none text-text-muted">{{ unit() }}</span>
      </div>

      <button
        type="button"
        class="flex h-12 w-12 flex-none items-center justify-center rounded-r-md text-text
               transition-colors duration-150
               hover:bg-surface-sunken active:bg-surface-sunken
               focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent
               disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        [disabled]="disabled() || value() >= max()"
        [attr.aria-label]="'Añadir ' + step() + ' ' + unit()"
        (click)="nudge(step())">
        <ui-icon name="plus" [size]="20" />
      </button>
    </div>
  `,
  styles: `:host { display: inline-block; max-width: 100%; }`,
})
export class QuantityStepper {
  protected readonly id = `ui-qty-${nextId++}`;

  readonly value = input.required<number>();
  readonly unit = input('u');
  readonly step = input(1);
  readonly min = input(0);
  readonly max = input(9999);
  readonly disabled = input(false);
  readonly label = input('Cantidad');

  readonly changed = output<QuantityChange>();

  /** Texto en edición. Se separa del valor para no pelear con el tecleo. */
  protected readonly draft = signal<string>('');

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('campo');

  /** Mientras el campo tiene el foco, nadie de fuera le reescribe el texto debajo. */
  private readonly editing = signal(false);

  constructor() {
    effect(() => {
      const value = this.value();
      // El valor puede cambiar desde fuera: una respuesta del servidor que corrige lo que
      // se había pintado por adelantado, o un conflicto que lo revierte. El borrador tiene
      // que seguirlo, o el campo mostraría una cifra que ya nadie sostiene.
      if (!this.editing()) {
        this.setDraft(this.formatNumber(value));
      }
    });
  }

  protected nudge(delta: number): void {
    const next = this.clamp(this.value() + delta);
    this.setDraft(this.formatNumber(next));
    // El delta real, no el pedido: pulsar −1 con 0,5 en la mano quita 0,5, y un movimiento
    // que dijera −1 dejaría la bitácora sin cuadrar con la cantidad.
    const applied = this.round(next - this.value());
    if (applied !== 0) {
      this.changed.emit({ value: next, delta: applied });
    }
  }

  protected onType(event: Event): void {
    this.editing.set(true);
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected onFocus(): void {
    this.editing.set(true);
  }

  protected commit(): void {
    this.editing.set(false);
    // Acepta coma decimal: es lo que teclea alguien en es-CL.
    const parsed = Number.parseFloat(this.draft().replace(',', '.'));
    if (Number.isNaN(parsed)) {
      this.setDraft(this.formatNumber(this.value()));
      return;
    }
    const next = this.clamp(parsed);
    this.setDraft(this.formatNumber(next));
    if (next !== this.value()) {
      this.changed.emit({ value: next, delta: null });
    }
  }

  /**
   * Escribe el texto en la señal y TAMBIÉN en el campo.
   *
   * Sólo con la señal no basta: si el valor enlazado no cambia entre dos comprobaciones
   * —teclear «dos docenas» y salir devuelve el mismo «12» de antes—, Angular no vuelve a
   * escribir el DOM y el campo se queda con lo que el usuario tecleó, que no es un número.
   */
  private setDraft(text: string): void {
    this.draft.set(text);
    const field = this.field();
    if (field) {
      field.nativeElement.value = text;
    }
  }

  private clamp(next: number): number {
    return this.round(Math.min(this.max(), Math.max(this.min(), next)));
  }

  private round(value: number): number {
    return Math.round(value * 1000) / 1000;
  }

  /**
   * Sin ceros de relleno: medio litro es «0,5», no «0,50». Dos decimales fijos hacían que la
   * misma cantidad se escribiera distinta en el control y en el resto de la pantalla.
   *
   * <p>Y SIN separador de miles, que en un campo editable no es decoración: «1.500» vuelve a
   * entrar por `commit`, donde el punto es decimal, y 1500 g de arroz se convertirían en 1,5.
   * El separador se queda para lo que sólo se lee.
   */
  private formatNumber(value: number): string {
    return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3, useGrouping: false })
      .format(value);
  }
}
