import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';

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
  imports: [Icon, NgTemplateOutlet, RouterLink],
  template: `
    <!--
      El contenido va en una plantilla y NO duplicado en las dos ramas. <ng-content>
      materializa el contenido proyectado UNA sola vez: con dos copias, Angular llena
      la primera y la otra sale vacía. Costó un botón "Entrar a…" que se renderizaba
      como una cápsula sin texto.
    -->
    <ng-template #contenido>
      @if (loading()) {
        <span class="ui-spinner" aria-hidden="true"></span>
      } @else if (icon()) {
        <ui-icon [name]="icon()!" [size]="size() === 'sm' ? 16 : 18" />
      }
      <span class="truncate"><ng-content /></span>
    </ng-template>

    <!-- Un enlace DESHABILITADO cae a la rama del botón a propósito. El atributo
         aria-disabled en un <a> es sólo un anuncio: el elemento sigue navegando con el
         ratón, con Enter y con el menú contextual. Un control que se ve apagado y funciona
         igual es peor que uno que no se apaga, porque promete algo que no cumple. Un
         <button disabled> sí es inerte para ratón, teclado y tecnología asistiva. -->
    @if (navigable(); as destino) {
      <!-- Navegar es seguir un enlace, no pulsar un botón. Con <a> el lector de pantalla
           lo anuncia como enlace y se puede abrir en otra pestaña; con <button> se
           pierden las dos cosas. -->
      <a
        [routerLink]="destino"
        [class]="classes()">
        <ng-container [ngTemplateOutlet]="contenido" />
      </a>
    } @else {
      <button
        [type]="type()"
        [disabled]="disabled() || loading()"
        [attr.aria-busy]="loading() ? 'true' : null"
        [class]="classes()"
        (click)="pressed.emit($event)">
        <ng-container [ngTemplateOutlet]="contenido" />
      </button>
    }
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

  /**
   * Destino de navegación. Cuando se indica, el componente renderiza un `<a>` en vez de
   * un `<button>`: mismo aspecto, semántica correcta. `loading` no aplica a un enlace.
   */
  readonly link = input<readonly string[] | string | null>(null);

  readonly pressed = output<MouseEvent>();

  /**
   * El destino, sólo si de verdad se puede ir.
   *
   * Un enlace deshabilitado no es un enlace: cae a la rama del botón, que sí es inerte.
   */
  protected readonly navigable = computed(() =>
    (this.disabled() || this.loading()) ? null : this.link());

  protected readonly classes = computed(() =>
    [
      'inline-flex items-center justify-center rounded-md font-medium',
      // Sin max-w-full un boton con etiqueta larga se dimensiona por su contenido y
      // desborda el contenedor: el truncate de la etiqueta nunca llega a aplicarse
      // porque el boton crece en vez de encoger. Se ve al ampliar al 200%, donde 375
      // se quedan en 188.
      'max-w-full',
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
