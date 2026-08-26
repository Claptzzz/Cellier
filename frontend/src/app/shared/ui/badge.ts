import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Icon } from './icon';
import type { IconName } from './icon.data';

export type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-text-muted border-border',
  accent: 'bg-accent-weak text-accent border-transparent',
  ok: 'bg-ok-weak text-ok border-transparent',
  warn: 'bg-warn-weak text-warn border-transparent',
  danger: 'bg-danger-weak text-danger border-transparent',
};

/**
 * Iconos de estado, elegidos por SILUETA y no por relleno ni por peso:
 *
 *   ok      marca de verificación, trazo abierto sin contorno
 *   warn    triángulo
 *   danger  círculo con aspa
 *
 * Triángulo contra círculo es la máxima diferencia de contorno disponible a 14px,
 * y es la convención de la señalética vial por la misma razón. `neutral` y
 * `accent` no llevan icono porque no son estados: rotulan categorías
 * ("Alacena", "Plantilla") y añadirles un glifo sería ruido.
 */
const TONE_ICONS: Record<BadgeTone, IconName | null> = {
  neutral: null,
  accent: null,
  ok: 'check',
  warn: 'warning',
  danger: 'x-circle',
};

/**
 * Etiqueta de estado.
 *
 * El tono NO es el canal de información, es refuerzo. Medido: `--ok`, `--warn` y
 * `--danger` tienen luminancias casi idénticas, así que en escala de grises o con
 * deuteranopía son indistinguibles entre sí. Por eso cada estado lleva un icono con
 * silueta propia, y por eso el texto de cada estado debe diferir además del tono
 * (WCAG 1.4.1).
 *
 * Esto importa especialmente para el par `warn` / `danger` ("vence pronto" contra
 * "vencido"), que es donde la confusión tiene consecuencias reales y donde los dos
 * tonos son más parecidos en gris.
 */
@Component({
  selector: 'ui-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <span [class]="classes()">
      @if (resolvedIcon(); as name) {
        <ui-icon [name]="name" [size]="13" />
      }
      <span><ng-content /></span>
    </span>
  `,
  styles: `:host { display: inline-flex; }`,
})
export class Badge {
  readonly tone = input<BadgeTone>('neutral');

  /**
   * Icono explícito. Se usa para rotular categorías con tono `neutral` o `accent`.
   * Pasar `'none'` quita el icono de un estado, algo que sólo debe hacerse cuando
   * el mismo icono ya aparece contiguo y repetirlo sería redundante.
   */
  readonly icon = input<IconName | 'none' | null>(null);

  protected readonly resolvedIcon = computed<IconName | null>(() => {
    const explicit = this.icon();
    if (explicit === 'none') {
      return null;
    }
    return explicit ?? TONE_ICONS[this.tone()];
  });

  protected readonly classes = computed(() =>
    [
      'inline-flex items-center gap-1 rounded-full border py-0.5',
      this.resolvedIcon() ? 'pl-1.5 pr-2' : 'px-2',
      'text-[12px] font-medium leading-5 whitespace-nowrap',
      TONES[this.tone()],
    ].join(' '),
  );
}
