import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { Icon } from './icon';
import type { IconName } from './icon.data';

/**
 * Botón que sólo muestra un icono. `label` es obligatorio: sin texto visible,
 * es la única forma de que un lector de pantalla lo anuncie.
 *
 * El área táctil nunca baja de 44px aunque el icono se vea más pequeño.
 */
@Component({
  selector: 'ui-icon-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <button
      type="button"
      [disabled]="disabled()"
      [attr.aria-label]="label()"
      [attr.aria-pressed]="pressedState() === null ? null : pressedState()"
      [title]="label()"
      [class]="classes()"
      (click)="pressed.emit($event)">
      <ui-icon [name]="name()" [size]="iconSize()" />
    </button>
  `,
  styles: `:host { display: contents; }`,
})
export class IconButton {
  readonly name = input.required<IconName>();
  readonly label = input.required<string>();
  readonly variant = input<'ghost' | 'solid'>('ghost');
  readonly disabled = input(false);
  readonly iconSize = input(20);
  /** Para botones de alternancia. null cuando no lo es. */
  readonly pressedState = input<boolean | null>(null);

  readonly pressed = output<MouseEvent>();

  protected readonly classes = computed(() =>
    [
      'inline-flex items-center justify-center rounded-sm',
      'min-w-[var(--touch-min)] min-h-[var(--touch-min)]',
      'transition-colors duration-150',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      'disabled:opacity-45 disabled:cursor-not-allowed',
      this.variant() === 'solid'
        ? 'bg-surface-raised border border-border-strong text-text hover:bg-surface-sunken'
        : 'text-text-muted hover:text-text hover:bg-surface-sunken',
    ].join(' '),
  );
}
