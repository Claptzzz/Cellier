import {
  ChangeDetectionStrategy, Component, ElementRef, computed, forwardRef, input, signal, viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { Icon } from './icon';
import { mirrorToNative } from './native-value';

let nextId = 0;

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Select nativo. Se usa el nativo a propósito: en móvil abre la rueda del sistema,
 * que es más rápida y más accesible que cualquier listbox propio.
 *
 * ⚠️ 16px por la misma razón que Input: auto-zoom de Safari en iOS.
 * El <select> nativo necesita background-color y color explícitos para que el
 * tema oscuro no lo pinte con los colores del sistema.
 */
@Component({
  selector: 'ui-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Select), multi: true },
  ],
  template: `
    <div class="flex flex-col gap-1.5">
      <label [for]="id" class="text-[13px] font-medium text-text">{{ label() }}</label>

      <div class="relative">
        <select
          #campo
          [id]="id"
          [disabled]="disabled()"
          [attr.aria-describedby]="error() ? id + '-error' : null"
          [attr.aria-invalid]="error() ? 'true' : null"
          [class]="selectClasses()"
          (change)="onSelect($event)"
          (blur)="onTouched()">
          @if (placeholder()) {
            <option value="" disabled>{{ placeholder() }}</option>
          }
          @for (option of options(); track option.value) {
            <option [value]="option.value">{{ option.label }}</option>
          }
        </select>

        <span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-text-muted">
          <ui-icon name="caret-down" [size]="16" />
        </span>
      </div>

      @if (error()) {
        <p [id]="id + '-error'" class="text-[13px] text-danger" role="alert">{{ error() }}</p>
      }
    </div>
  `,
  styles: `:host { display: block; }`,
})
export class Select implements ControlValueAccessor {
  protected readonly id = `ui-select-${nextId++}`;

  readonly label = input.required<string>();
  readonly options = input.required<readonly SelectOption[]>();
  readonly placeholder = input('');
  readonly error = input('');

  protected readonly value = signal('');
  protected readonly disabled = signal(false);

  private readonly field = viewChild<ElementRef<HTMLSelectElement>>('campo');

  constructor() {
    // Un <select> además necesita que sus <option> existan cuando se le fija el valor, y el
    // efecto corre cuando la vista ya está montada. El enlace lo intentaba antes de tiempo.
    mirrorToNative(this.field, this.value);
  }

  private onChange: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  protected readonly selectClasses = computed(() =>
    [
      'w-full appearance-none rounded-sm border h-11 pl-3 pr-9',
      // Explícitos para que el nativo respete el tema oscuro.
      'bg-surface-raised text-text',
      'text-[length:var(--text-control)]',
      'transition-colors duration-150',
      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
      'disabled:opacity-45 disabled:cursor-not-allowed disabled:bg-surface-sunken',
      this.error() ? 'border-danger' : 'border-border-strong hover:border-text-muted',
    ].join(' '),
  );

  protected onSelect(event: Event): void {
    const next = (event.target as HTMLSelectElement).value;
    this.value.set(next);
    this.onChange(next);
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
