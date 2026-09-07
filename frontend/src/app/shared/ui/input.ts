import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { Icon } from './icon';
import type { IconName } from './icon.data';

let nextId = 0;

/**
 * Campo de texto.
 *
 * Etiqueta ARRIBA, ayuda opcional, error DEBAJO. Nunca placeholder como etiqueta.
 *
 * ⚠️ El tamaño de fuente es var(--text-control) = 16px, no var(--text-base) = 15px.
 * Safari en iOS hace auto-zoom al enfocar cualquier campo por debajo de 16px y
 * deja la página descuadrada. No lo bajes "por consistencia" con el cuerpo.
 */
@Component({
  selector: 'ui-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Input), multi: true },
  ],
  template: `
    <div class="flex flex-col gap-1.5">
      <label [for]="id" class="text-[13px] font-medium text-text">
        {{ label() }}
        @if (!required()) {
          <span class="font-normal text-text-muted">(opcional)</span>
        }
      </label>

      <div class="relative">
        @if (icon()) {
          <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-muted">
            <ui-icon [name]="icon()!" [size]="18" />
          </span>
        }

        <input
          [id]="id"
          [type]="type()"
          [attr.inputmode]="inputMode()"
          [attr.autocomplete]="autocomplete()"
          [attr.name]="name() || null"
          [attr.placeholder]="placeholder() || null"
          [attr.aria-describedby]="describedBy()"
          [attr.aria-invalid]="error() ? 'true' : null"
          [attr.spellcheck]="spellcheck()"
          [disabled]="disabled()"
          [value]="value()"
          [class]="inputClasses()"
          (input)="onInput($event)"
          (blur)="onTouched()" />
      </div>

      @if (error()) {
        <p [id]="id + '-error'" class="text-[13px] text-danger" role="alert">{{ error() }}</p>
      } @else if (hint()) {
        <p [id]="id + '-hint'" class="text-[13px] text-text-muted">{{ hint() }}</p>
      }
    </div>
  `,
  styles: `:host { display: block; }`,
})
export class Input implements ControlValueAccessor {
  protected readonly id = `ui-input-${nextId++}`;

  readonly label = input.required<string>();
  readonly type = input<'text' | 'email' | 'tel' | 'url' | 'number' | 'search' | 'password'>('text');
  readonly placeholder = input('');
  readonly hint = input('');
  readonly error = input('');
  readonly required = input(true);
  readonly icon = input<IconName | null>(null);
  readonly name = input('');
  readonly autocomplete = input('off');
  readonly inputMode = input<string | null>(null);
  /** Se desactiva en correos, códigos y nombres de usuario. */
  readonly spellcheck = input(false);

  /**
   * Anchura fija y letras separadas, para valores que se transcriben carácter a carácter
   * —un código de invitación— en vez de leerse como palabra. Es el mismo motivo por el
   * que las cantidades van en monoespaciada: lo que se compara o se copia signo a signo
   * necesita que todos los signos ocupen lo mismo.
   */
  readonly mono = input(false);

  protected readonly value = signal('');
  protected readonly disabled = signal(false);

  private onChange: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  protected readonly describedBy = computed(() =>
    this.error() ? `${this.id}-error` : this.hint() ? `${this.id}-hint` : null,
  );

  protected readonly inputClasses = computed(() =>
    [
      'w-full rounded-sm border bg-surface-raised text-text',
      // 16px obligatorio. Ver comentario de cabecera.
      'text-[length:var(--text-control)]',
      'h-11 px-3',
      this.icon() ? 'pl-10' : '',
      'placeholder:text-text-muted',
      'transition-colors duration-150',
      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
      'disabled:opacity-45 disabled:cursor-not-allowed disabled:bg-surface-sunken',
      this.error() ? 'border-danger' : 'border-border-strong hover:border-text-muted',
      // El tamaño sigue siendo --text-control: la monoespaciada cambia la familia y el
      // espaciado, nunca los 16px que evitan el auto-zoom de Safari en iOS.
      this.mono() ? 'font-mono tracking-[0.14em] uppercase' : '',
    ].join(' '),
  );

  protected onInput(event: Event): void {
    const next = (event.target as HTMLInputElement).value;
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
