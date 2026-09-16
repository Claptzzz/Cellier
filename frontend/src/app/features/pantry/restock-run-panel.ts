import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ViewportService } from '../../core/layout/viewport.service';
import { formatQuantity, stepFor, unitLabel } from '../../core/pantry/pantry.models';
import type { PantryItem } from '../../core/pantry/pantry.models';
import { BottomSheet } from '../../shared/ui/bottom-sheet';
import { Button } from '../../shared/ui/button';
import { Dialog } from '../../shared/ui/dialog';
import { Icon } from '../../shared/ui/icon';
import { Input } from '../../shared/ui/input';
import { QuantityStepper } from '../../shared/ui/quantity-stepper';

interface Sumado {
  readonly itemId: string;
  readonly name: string;
  readonly unit: string;
  readonly total: number;
}

/**
 * «Acabo de llegar del súper».
 *
 * <p>Vaciar una bolsa son ocho productos seguidos, y el flujo normal —abrir, buscar, sumar,
 * cerrar, repetir— cobra cuatro gestos por cada uno. Aquí el panel **no se cierra**: se busca,
 * se suma, y el campo vuelve a quedar listo para el siguiente.
 *
 * <p>Lo sumado se va apilando a la vista, y al terminar se enseña el resumen completo. No es
 * adorno: quien vacía una bolsa pierde la cuenta, y la única forma de saber si se saltó algo
 * es leer lo que sí entró.
 *
 * <p>Cada suma va por `restock`, que es un delta relativo: compone con lo que cualquier otro
 * miembro haga a la vez, sin versiones ni conflictos.
 */
@Component({
  selector: 'app-restock-run-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BottomSheet, Button, Dialog, FormsModule, Icon, Input, NgTemplateOutlet, QuantityStepper],
  template: `
    <ng-template #contenido>
      @if (done()) {
        <!-- ============ RESUMEN ============ -->
        <div class="flex flex-col gap-4">
          @if (added().length === 0) {
            <p class="text-[15px] text-text-muted">No sumaste nada esta vez.</p>
          } @else {
            <p class="text-[15px] text-text">{{ summaryLine() }}</p>
            <ul class="flex list-none flex-col gap-0 p-0">
              @for (entry of added(); track entry.itemId) {
                <li class="flex items-baseline justify-between gap-3 border-b border-border py-2.5
                           last:border-0">
                  <span class="truncate text-[15px] text-text">{{ entry.name }}</span>
                  <span class="flex-none font-mono text-[15px] tabular-nums text-ok">
                    +{{ format(entry.total) }} {{ entry.unit }}
                  </span>
                </li>
              }
            </ul>
          }
          <div class="flex justify-end pt-1">
            <ui-button (pressed)="closed.emit()">Listo</ui-button>
          </div>
        </div>
      } @else {
        <!-- ============ SUMANDO ============ -->
        <div class="flex flex-col gap-4">
          <ui-input
            label="Qué guardaste"
            name="buscar"
            placeholder="Huevos, leche…"
            autocomplete="off"
            [ngModelOptions]="{ standalone: true }"
            [ngModel]="search()"
            (ngModelChange)="onSearch($event)" />

          @if (chosen(); as item) {
            <div class="flex flex-col gap-3 rounded-md border border-border bg-surface-sunken p-3">
              <p class="text-[15px] font-medium text-text">{{ item.product.name }}</p>
              <div class="flex items-center justify-between gap-3">
                <span class="text-[13px] text-text-muted">
                  Tienes {{ format(item.quantity) }} {{ unitOf(item) }}
                </span>
                <ui-quantity-stepper
                  [value]="amount()"
                  [unit]="unitOf(item)"
                  [step]="stepOf(item)"
                  [max]="999999"
                  label="Cuánto sumar"
                  (changed)="amount.set($event.value)" />
              </div>
              <div class="flex justify-end gap-2">
                <ui-button variant="secondary" (pressed)="cancelChoice()">Otro</ui-button>
                <ui-button [disabled]="amount() <= 0" (pressed)="commit()">Sumar</ui-button>
              </div>
            </div>
          } @else if (matches().length > 0) {
            <ul class="flex list-none flex-col gap-0.5 p-0" aria-label="En tu despensa">
              @for (item of matches(); track item.id) {
                <li>
                  <button type="button" class="opcion" (click)="choose(item)">
                    <span class="truncate">{{ item.product.name }}</span>
                    <span class="flex-none text-[13px] text-text-muted">
                      {{ format(item.quantity) }} {{ unitOf(item) }}
                    </span>
                  </button>
                </li>
              }
            </ul>
          } @else if (search().trim().length > 0) {
            <p class="text-[13px] text-text-muted">
              No tienes nada así en la despensa. Para algo nuevo, usa «Agregar producto».
            </p>
          }

          <!-- Lo que ya entró, a la vista mientras se sigue vaciando la bolsa. -->
          @if (added().length > 0) {
            <div class="flex flex-col gap-2 border-t border-border pt-3">
              <p class="text-[13px] font-medium text-text">Ya guardaste</p>
              <ul class="flex list-none flex-wrap gap-1.5 p-0">
                @for (entry of added(); track entry.itemId) {
                  <li class="flex items-center gap-1 rounded-full bg-ok-weak px-2.5 py-1
                             text-[13px] text-ok">
                    <ui-icon name="check" [size]="13" />
                    {{ entry.name }} +{{ format(entry.total) }}
                  </li>
                }
              </ul>
            </div>
          }

          <div class="flex justify-end gap-2 pt-1">
            <ui-button variant="secondary" (pressed)="finish()">
              {{ added().length > 0 ? 'Terminar' : 'Cancelar' }}
            </ui-button>
          </div>
        </div>
      }
    </ng-template>

    @if (isDesktop()) {
      <ui-dialog [open]="open()" [title]="title()" (closed)="closed.emit()">
        <ng-container *ngTemplateOutlet="contenido" />
      </ui-dialog>
    } @else {
      <ui-bottom-sheet [open]="open()" [title]="title()" (closed)="closed.emit()">
        <ng-container *ngTemplateOutlet="contenido" />
      </ui-bottom-sheet>
    }
  `,
  styles: `
    :host { display: contents; }

    .opcion {
      display: flex;
      width: 100%;
      /* Tercera copia del mismo bloque —las otras dos son .sugerencia en add-item-panel y en
         template-editor-page— y el mismo relleno de 0.625rem que sumaba 43px. Tres copias de
         un estilo son tres sitios donde arreglar el mismo pixel. */
      min-height: var(--touch-min);
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      border-radius: var(--radius-sm);
      padding: 0.625rem 0.75rem;
      text-align: left;
      font-size: 15px;
      color: var(--text);
    }
    .opcion:hover { background: var(--surface-sunken); }
    .opcion:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  `,
})
export class RestockRunPanel {
  private readonly viewport = inject(ViewportService);

  readonly open = input(false);
  /** La despensa entera: aquí no se busca en el servidor, se filtra lo que ya está cargado. */
  readonly items = input.required<readonly PantryItem[]>();

  readonly closed = output<void>();
  /** Suma esta cantidad a este artículo. Lo aplica quien sabe hacerlo. */
  readonly restocked = output<{ itemId: string; amount: number }>();

  protected readonly isDesktop = this.viewport.isDesktop;

  protected readonly search = signal('');
  protected readonly chosen = signal<PantryItem | null>(null);
  protected readonly amount = signal(1);
  protected readonly added = signal<readonly Sumado[]>([]);
  protected readonly done = signal(false);

  protected readonly title = computed(() =>
    this.done() ? 'Lo que guardaste' : 'Acabo de llegar del súper');

  /**
   * Se filtra en memoria, sin pedir nada al servidor.
   *
   * La despensa entera ya está cargada —no se pagina— y quien está vaciando una bolsa en la
   * cocina teclea rápido: una ida y vuelta por letra sería un retraso sin nada que ganar.
   */
  protected readonly matches = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) {
      return [];
    }
    return this.items()
      .filter((item) => item.product.name.toLowerCase().includes(term))
      .slice(0, 6);
  });

  protected readonly summaryLine = computed(() => {
    const total = this.added().length;
    return total === 1 ? 'Guardaste 1 producto.' : `Guardaste ${total} productos.`;
  });

  constructor() {
    effect(() => {
      // Cada visita al súper es una lista nueva; la anterior ya se resumió y se cerró.
      if (this.open()) {
        this.reset();
      }
    });
  }

  protected format(value: number): string {
    return formatQuantity(value);
  }

  protected unitOf(item: PantryItem): string {
    return unitLabel(item.product.unit);
  }

  protected stepOf(item: PantryItem): number {
    return stepFor(item.product.unit);
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    this.chosen.set(null);
  }

  protected choose(item: PantryItem): void {
    this.chosen.set(item);
    this.amount.set(stepFor(item.product.unit));
  }

  protected cancelChoice(): void {
    this.chosen.set(null);
    this.search.set('');
  }

  protected commit(): void {
    const item = this.chosen();
    const amount = this.amount();
    if (!item || amount <= 0) {
      return;
    }
    this.restocked.emit({ itemId: item.id, amount });

    // Sumar dos veces el mismo producto es una línea sola con el total: la bolsa traía dos
    // cartones de huevos, no dos entradas distintas que luego haya que sumar de cabeza.
    this.added.update((current) => {
      const previous = current.find((entry) => entry.itemId === item.id);
      const entry: Sumado = {
        itemId: item.id,
        name: item.product.name,
        unit: unitLabel(item.product.unit),
        total: (previous?.total ?? 0) + amount,
      };
      return previous
        ? current.map((c) => (c.itemId === item.id ? entry : c))
        : [...current, entry];
    });

    // Listo para el siguiente, sin cerrar nada.
    this.chosen.set(null);
    this.search.set('');
  }

  protected finish(): void {
    if (this.added().length === 0) {
      this.closed.emit();
      return;
    }
    this.done.set(true);
  }

  private reset(): void {
    this.search.set('');
    this.chosen.set(null);
    this.amount.set(1);
    this.added.set([]);
    this.done.set(false);
  }
}
