import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { expiryLabel, expiryState, formatExpiry } from '../../core/pantry/expiry';
import { formatQuantity, stepFor, unitLabel } from '../../core/pantry/pantry.models';
import type { PantryItem } from '../../core/pantry/pantry.models';
import { Badge } from '../../shared/ui/badge';
import { LevelBand } from '../../shared/ui/level-band';
import { QuantityStepper } from '../../shared/ui/quantity-stepper';
import type { BadgeTone } from '../../shared/ui/badge';
import type { LevelState } from '../../shared/ui/level-band';
import type { QuantityChange } from '../../shared/ui/quantity-stepper';

/**
 * Una línea de la despensa.
 *
 * Se lee de pie, con una mano y a un brazo de distancia, así que el orden de lectura manda
 * sobre la densidad: primero qué es, después cuánto queda, y sólo al final los detalles.
 * La cantidad va a la derecha, en cifras tabulares, para que una columna de números se
 * compare de un vistazo sin leer cada fila entera.
 */
@Component({
  selector: 'app-pantry-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, LevelBand, QuantityStepper],
  template: `
    <article
      class="flex min-h-[68px] items-stretch gap-3 rounded-md border border-border
             bg-surface-raised p-3 shadow-e1"
      [class.opacity-60]="isGone()">

      <ui-level-band
        [level]="level()"
        [hasTarget]="item().parLevel !== null"
        [state]="state()"
        [itemLabel]="item().product.name" />

      <!-- Se envuelve: a 375 el stepper no cabe junto al nombre y baja a su propia línea,
           que además es donde el pulgar llega sin recolocar la mano. -->
      <div class="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-3">
        <div class="flex min-w-0 flex-1 basis-[9rem] flex-col gap-1">
          <p class="truncate text-[15px] font-medium text-text">{{ item().product.name }}</p>

          <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            @if (item().product.category; as category) {
              <ui-badge tone="neutral">{{ category }}</ui-badge>
            }

            <!-- El aviso NUNCA se codifica sólo por color: el icono del badge y este texto
                 son lo que separa "vence pronto" de "vencido" en escala de grises. -->
            @if (warning(); as warning) {
              <ui-badge [tone]="warning.tone" [title]="fullDate()">{{ warning.text }}</ui-badge>
            } @else if (item().expiresAt; as expiresAt) {
              <span class="truncate text-[13px] text-text-muted">Vence {{ fullDate() }}</span>
            }
          </div>
        </div>

        <div class="flex flex-none items-center gap-2">
          <!-- El objetivo, cuando lo hay, y a la izquierda del control para que se lea
               «4 … de 12». Es el canal que la banda no puede dar: sin color, una banda llena
               y una sin objetivo son el mismo gris a plena altura, y son los dos extremos
               del significado. Que este texto esté o falte es lo que los separa. -->
          @if (item().parLevel !== null) {
            <span class="whitespace-nowrap text-[13px] text-text-muted">de {{ target() }}</span>
          }

          <ui-quantity-stepper
            [value]="item().quantity"
            [unit]="unit()"
            [step]="step()"
            [max]="999999"
            [label]="'Cantidad de ' + item().product.name"
            (changed)="changed.emit($event)" />
        </div>
      </div>
    </article>
  `,
  styles: `:host { display: block; }`,
})
export class PantryRow {
  readonly item = input.required<PantryItem>();

  /** El «hoy» entra por parámetro para que la fila sea comprobable sin tocar el reloj. */
  readonly today = input.required<Date>();

  /** Un cambio de cantidad, diciendo si fue un toque o un número escrito. */
  readonly changed = output<QuantityChange>();

  protected readonly isGone = computed(() => this.item().quantity <= 0);

  protected readonly quantity = computed(() => formatQuantity(this.item().quantity));

  protected readonly step = computed(() => stepFor(this.item().product.unit));

  protected readonly target = computed(() => {
    const parLevel = this.item().parLevel;
    return parLevel === null ? '' : formatQuantity(parLevel);
  });

  protected readonly unit = computed(() => unitLabel(this.item().product.unit));

  protected readonly fullDate = computed(() => {
    const expiresAt = this.item().expiresAt;
    return expiresAt ? formatExpiry(expiresAt) : '';
  });

  /** Porcentaje de lo que queda respecto del objetivo. Sólo significa algo si hay objetivo. */
  protected readonly level = computed(() => {
    const { quantity, parLevel } = this.item();
    if (parLevel === null || parLevel <= 0) {
      return 0;
    }
    return Math.round((quantity / parLevel) * 100);
  });

  protected readonly warning = computed<{ tone: BadgeTone; text: string } | null>(() => {
    const { expiresAt } = this.item();
    const state = expiryState(expiresAt, this.today());
    if (state === 'none') {
      return null;
    }
    return {
      tone: state === 'expired' ? 'danger' : 'warn',
      text: expiryLabel(expiresAt, this.today()),
    };
  });

  protected readonly state = computed<LevelState>(() => {
    const item = this.item();
    if (item.quantity <= 0) {
      return 'empty';
    }
    const expiry = expiryState(item.expiresAt, this.today());
    if (expiry === 'expired') {
      return 'danger';
    }
    if (expiry === 'soon') {
      return 'warn';
    }
    // Queda poco respecto de lo que el hogar considera suficiente. Sin objetivo definido
    // no hay nada contra lo que ser poco, así que no se avisa.
    if (item.parLevel !== null && item.parLevel > 0 && item.quantity <= item.parLevel * 0.25) {
      return 'warn';
    }
    return 'ok';
  });
}
