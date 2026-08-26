import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { Icon } from './icon';
import type { IconName } from './icon.data';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-contrast border border-transparent ' +
    'hover:brightness-110 active:brightness-95',
  secondary:
    'bg-surface-raised text-text border border-border-strong ' +
    'hover:bg-surface-sunken active:bg-surface-sunken',
  ghost:
    'bg-transparent text-text border border-transparent ' +
    'hover:bg-surface-sunken active:bg-surface-sunken',
  danger:
    'bg-danger text-white border border-transparent ' +
    'hover:brightness-110 active:brightness-95',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5',
  md: 'h-11 px-4 text-[15px] gap-2',
  // 48px: primaria a ancho completo en móvil, cómoda a una mano.
  lg: 'h-12 px-5 text-[15px] gap-2',
};

@Component({
  selector: 'ui-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || loading()"
      [attr.aria-busy]="loading() ? 'true' : null"
      [class]="classes()"
      (click)="pressed.emit($event)">

      @if (loading()) {
        <span class="ui-spinner" aria-hidden="true"></span>
      } @else if (icon()) {
        <ui-icon [name]="icon()!" [size]="size() === 'sm' ? 16 : 18" />
      }

      <span class="truncate"><ng-content /></span>
    </button>
  `,
  styles: `
    :host { display: contents; }

    .ui-spinner {
      width: 16px; height: 16px; flex: none;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 999px;
      animation: ui-spin 0.7s linear infinite;
    }
    @keyframes ui-spin { to { transform: rotate(360deg); } }

    /* El giro es feedback de estado, no adorno. Bajo movimiento reducido se
       detiene y el aria-busy sigue anunciando la espera. */
    @media (prefers-reduced-motion: reduce) {
      .ui-spinner { animation: none; opacity: 0.6; }
    }
  `,
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly block = input(false);
  readonly icon = input<IconName | null>(null);

  readonly pressed = output<MouseEvent>();

  protected readonly classes = computed(() =>
    [
      'inline-flex items-center justify-center rounded-md font-medium',
      'transition-[filter,background-color,transform] duration-150',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      // Empuje físico al pulsar. Sólo transform, nunca layout.
      'active:translate-y-px',
      'disabled:opacity-45 disabled:cursor-not-allowed disabled:active:translate-y-0',
      'disabled:hover:brightness-100',
      VARIANTS[this.variant()],
      SIZES[this.size()],
      this.block() ? 'w-full' : '',
    ].join(' '),
  );
}
