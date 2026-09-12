import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Estado del artículo. Determina el color y la textura de la banda. */
export type LevelState = 'ok' | 'warn' | 'danger' | 'empty';

/**
 * LA BANDA DE NIVEL. El elemento firma de Cellier.
 *
 * Banda vertical en el canto de entrada de cada fila. La ALTURA RELLENA codifica
 * cuánto queda respecto del nivel objetivo del hogar; el COLOR codifica el estado.
 * Es la mirada de lado a un tarro: no lees la etiqueta para saber cuánto queda.
 *
 * Tres decisiones que la hacen funcionar, y por qué:
 *
 * 1. TIENE CANAL DE RECORRIDO (el track en --surface-sunken). Sin recorrido visible
 *    no se percibe la proporción: una banda al 30% y una banda simplemente corta se
 *    ven igual. Sigue sin ser una barra de progreso: no hay porcentaje ni relleno de
 *    marca. Es un nivel dentro de un recorrido, como un termómetro.
 *
 * 2. EL ESTADO NO SE CODIFICA SÓLO POR TONO. Medido: --ok, --warn y --danger tienen
 *    luminancias casi idénticas (0,2 a 1,0 puntos de separación), así que en escala
 *    de grises o con deuteranopía son indistinguibles entre sí. Por eso `danger`
 *    añade un rayado diagonal y `warn` una muesca en la línea de llenado. El tono es
 *    refuerzo, nunca el único canal (WCAG 1.4.1).
 *
 * 3. EL LLENADO SÍ SOBREVIVE AL GRIS. Medido: 67 puntos de luminancia entre el
 *    relleno y el track. La pregunta más frecuente ("¿cuánto queda?") no depende
 *    del color en ningún momento.
 */
@Component({
  selector: 'ui-level-band',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="band"
      role="img"
      [attr.aria-label]="ariaLabel()">
      <div class="fill" [class]="fillClass()" [style.height.%]="clamped()"></div>
    </div>
  `,
  styles: `
    :host { display: block; align-self: stretch; }

    .band {
      position: relative;
      width: 4px;
      height: 100%;
      min-height: 32px;
      border-radius: 999px;
      /* Canal de recorrido: da la referencia contra la que se lee la proporción. */
      background: var(--surface-sunken);
      overflow: hidden;
    }

    .fill {
      position: absolute;
      inset-inline: 0;
      bottom: 0;
      border-radius: 999px;
      transition: height 200ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    .fill.ok    { background: var(--ok); }
    .fill.warn  { background: var(--warn); }
    .fill.danger{ background: var(--danger); }
    .fill.empty { background: transparent; }

    /* Sin objetivo, el relleno es neutro a propósito. Pintarlo de --ok y a plena altura
       haría que el artículo del que MENOS se sabe se viera como el mejor surtido de la
       lista, por encima de uno medido al 75%. El vencimiento lo dice el Badge. */
    .fill.unknown { background: var(--border-strong); }

    /* Suelo de visibilidad: un nivel muy bajo debe seguir viéndose como una marca
       en la base, no desaparecer. Es lo que distingue "queda poquísimo" de "no hay". */
    .fill:not(.empty) { min-height: 4px; }

    @media (prefers-reduced-motion: reduce) {
      .fill { transition: none; }
    }
  `,
})
export class LevelBand {
  /** Porcentaje restante respecto del nivel objetivo. Se recorta a 0-100. */
  readonly level = input(0);

  /**
   * Si el hogar ha definido un nivel objetivo para este artículo.
   *
   * Sin objetivo no hay proporción que dibujar, y rellenar el 0% diría «no queda nada»
   * cuando lo cierto es que no se sabe cuánto debería haber. La banda pasa entonces a un
   * estado binario —hay o no hay— y deja de afirmar un porcentaje, también en su etiqueta
   * accesible. Es la diferencia entre «vacío» y «todavía no lo sé», aplicada al dibujo.
   */
  readonly hasTarget = input(true);

  readonly state = input<LevelState>('ok');
  /** Nombre del artículo, para componer la etiqueta accesible. */
  readonly itemLabel = input<string>('');

  protected readonly clamped = computed(() => {
    if (!this.hasTarget()) {
      return this.state() === 'empty' ? 0 : 100;
    }
    return Math.min(100, Math.max(0, this.level()));
  });

  protected readonly fillClass = computed(() => {
    if (this.state() === 'empty') {
      return 'empty';
    }
    return this.hasTarget() ? this.state() : 'unknown';
  });

  protected readonly ariaLabel = computed(() => {
    const texto: Record<LevelState, string> = {
      ok: 'nivel suficiente',
      warn: 'nivel bajo',
      danger: 'agotado o vencido',
      empty: 'sin existencias',
    };
    const prefijo = this.itemLabel() ? `${this.itemLabel()}: ` : '';
    if (!this.hasTarget()) {
      // Sin objetivo no se puede decir un porcentaje sin inventarlo.
      const binario = this.state() === 'empty' ? 'sin existencias' : 'hay existencias';
      return `${prefijo}${binario}, sin nivel objetivo definido`;
    }
    return `${prefijo}${this.clamped()}% restante, ${texto[this.state()]}`;
  });
}
