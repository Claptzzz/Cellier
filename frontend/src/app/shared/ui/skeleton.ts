import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Marcador de carga con la forma del contenido final, no un spinner genérico.
 * El brillo se detiene bajo movimiento reducido.
 */
@Component({
  selector: 'ui-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="sk"
      role="status"
      aria-live="polite"
      [attr.aria-label]="label()"
      [style.width]="width()"
      [style.height]="height()"
      [style.border-radius]="radius()"></span>
  `,
  styles: `
    :host { display: block; }

    .sk {
      display: block;
      background: var(--surface-sunken);
      position: relative;
      overflow: hidden;
    }

    .sk::after {
      content: '';
      position: absolute;
      inset: 0;
      transform: translateX(-100%);
      background: linear-gradient(90deg, transparent, rgb(128 128 128 / 0.14), transparent);
      animation: sk-shimmer 1.4s ease-in-out infinite;
    }

    @media (prefers-reduced-motion: reduce) {
      .sk::after { animation: none; }
    }

    @keyframes sk-shimmer { to { transform: translateX(100%); } }
  `,
})
export class Skeleton {
  readonly width = input('100%');
  readonly height = input('16px');
  readonly radius = input('6px');
  readonly label = input('Cargando');
}
