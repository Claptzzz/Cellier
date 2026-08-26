import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { Icon } from './icon';

let nextId = 0;

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

      <div class="flex min-w-0 flex-1 basis-[84px] flex-col items-center justify-center border-x border-border px-1.5">
        <input
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

  readonly valueChange = output<number>();

  /** Texto en edición. Se separa del valor para no pelear con el tecleo. */
  protected readonly draft = signal<string>('');

  private readonly syncDraft = computed(() => this.formatNumber(this.value()));

  constructor() {
    // Mantiene el borrador alineado con el valor cuando cambia desde fuera.
    this.draft.set(this.formatNumber(0));
    queueMicrotask(() => this.draft.set(this.syncDraft()));
  }

  protected nudge(delta: number): void {
    this.emit(this.value() + delta);
  }

  protected onType(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected commit(): void {
    // Acepta coma decimal: es lo que teclea alguien en es-CL.
    const parsed = Number.parseFloat(this.draft().replace(',', '.'));
    if (Number.isNaN(parsed)) {
      this.draft.set(this.formatNumber(this.value()));
      return;
    }
    this.emit(parsed);
  }

  private emit(next: number): void {
    const clamped = Math.min(this.max(), Math.max(this.min(), next));
    const rounded = Math.round(clamped * 100) / 100;
    this.draft.set(this.formatNumber(rounded));
    if (rounded !== this.value()) {
      this.valueChange.emit(rounded);
    }
  }

  private formatNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');
  }
}
