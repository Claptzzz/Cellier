import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked,
} from '@angular/core';

import { ViewportService } from '../../core/layout/viewport.service';
import { PantryApi } from '../../core/pantry/pantry.api';
import { expiryLabel, expiryState, formatExpiry } from '../../core/pantry/expiry';
import { formatQuantity, movementLabel, unitLabel } from '../../core/pantry/pantry.models';
import type { PantryItem, StockMovement } from '../../core/pantry/pantry.models';
import { Badge } from '../../shared/ui/badge';
import { BottomSheet } from '../../shared/ui/bottom-sheet';
import { Button } from '../../shared/ui/button';
import { Dialog } from '../../shared/ui/dialog';
import { Skeleton } from '../../shared/ui/skeleton';

/** Cuántos movimientos se traen de una vez. Caben en una pantalla sin scroll propio. */
const PAGE_SIZE = 10;

/**
 * El detalle de un artículo, con la bitácora que explica su cantidad.
 *
 * <p>La lista responde «cuánto queda». Esto responde «por qué»: quién se llevó los huevos y
 * cuándo. Es la misma información que sostiene el invariante del módulo —la cantidad es la
 * suma de estos movimientos—, puesta donde alguien la puede leer.
 *
 * <p>Se pagina y se pide **al abrir**, no al cargar la lista: son datos que casi nunca se
 * miran, y traerlos para los treinta artículos de una despensa sería pagar por adelantado
 * algo que se usa una vez al mes.
 */
@Component({
  selector: 'app-item-detail-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, BottomSheet, Button, Dialog, NgTemplateOutlet, Skeleton],
  template: `
    <ng-template #contenido>
      @if (item(); as item) {
        <div class="flex flex-col gap-5">

          <!-- ============ LO QUE HAY ============ -->
          <div class="flex flex-col gap-2">
            <p class="flex items-baseline gap-1.5">
              <span class="font-mono text-[24px] tabular-nums text-text">
                {{ quantity() }}
              </span>
              <span class="text-[15px] text-text-muted">{{ unit() }}</span>
              @if (item.parLevel !== null) {
                <span class="text-[13px] text-text-muted">de {{ target() }}</span>
              }
            </p>

            <div class="flex flex-wrap items-center gap-2">
              @if (item.product.category; as category) {
                <ui-badge tone="neutral">{{ category }}</ui-badge>
              }
              @if (warning(); as warning) {
                <ui-badge [tone]="warning.tone">{{ warning.text }}</ui-badge>
              } @else if (item.expiresAt) {
                <span class="text-[13px] text-text-muted">Vence {{ fullDate() }}</span>
              } @else {
                <span class="text-[13px] text-text-muted">Sin fecha de vencimiento</span>
              }
            </div>
          </div>

          <!-- ============ LA BITÁCORA ============ -->
          <section class="flex flex-col gap-3" aria-labelledby="titulo-historial">
            <h3 id="titulo-historial" class="text-[13px] font-medium text-text">
              Movimientos
            </h3>

            @if (loading() && movements().length === 0) {
              <div class="flex flex-col gap-3">
                @for (fila of [1, 2, 3]; track fila) {
                  <div class="flex items-center justify-between gap-3">
                    <ui-skeleton width="55%" height="14px" label="Cargando el historial" />
                    <ui-skeleton width="52px" height="14px" />
                  </div>
                }
              </div>
            } @else if (failed()) {
              <p class="text-[13px] text-text-muted">
                No pudimos traer el historial.
                <button type="button" class="underline" (click)="load(0)">Reintentar</button>
              </p>
            } @else if (movements().length === 0) {
              <p class="text-[13px] text-text-muted">
                Todavía no hay movimientos. Los cambios de cantidad aparecerán aquí.
              </p>
            } @else {
              <ul class="flex list-none flex-col gap-0 p-0">
                @for (movement of movements(); track movement.id) {
                  <li class="flex items-baseline justify-between gap-3 border-b border-border py-2.5
                             last:border-0">
                    <div class="flex min-w-0 flex-col">
                      <span class="text-[14px] text-text">{{ describe(movement) }}</span>
                      <span class="text-[12px] text-text-muted">{{ when(movement) }}</span>
                    </div>
                    <span
                      class="flex-none font-mono text-[14px] tabular-nums"
                      [class.text-ok]="movement.delta > 0"
                      [class.text-danger]="movement.delta < 0">
                      {{ signed(movement) }}
                    </span>
                  </li>
                }
              </ul>

              @if (hasMore()) {
                <ui-button
                  variant="secondary"
                  [loading]="loading()"
                  (pressed)="load(nextPage())">
                  Ver más
                </ui-button>
              }
            }
          </section>
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
  styles: `:host { display: contents; }`,
})
export class ItemDetailPanel {
  private readonly api = inject(PantryApi);
  private readonly viewport = inject(ViewportService);

  readonly open = input(false);
  readonly householdId = input.required<string>();
  readonly item = input<PantryItem | null>(null);
  readonly today = input.required<Date>();

  readonly closed = output<void>();

  protected readonly isDesktop = this.viewport.isDesktop;

  protected readonly movements = signal<readonly StockMovement[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  private readonly loaded = signal(0);
  private readonly total = signal(0);

  protected readonly title = computed(() => this.item()?.product.name ?? 'Artículo');
  protected readonly quantity = computed(() => formatQuantity(this.item()?.quantity ?? 0));
  protected readonly unit = computed(() => {
    const item = this.item();
    return item ? unitLabel(item.product.unit) : '';
  });
  protected readonly target = computed(() => {
    const parLevel = this.item()?.parLevel;
    return parLevel === null || parLevel === undefined ? '' : formatQuantity(parLevel);
  });
  protected readonly fullDate = computed(() => {
    const expiresAt = this.item()?.expiresAt;
    return expiresAt ? formatExpiry(expiresAt) : '';
  });
  protected readonly warning = computed(() => {
    const expiresAt = this.item()?.expiresAt;
    const state = expiryState(expiresAt, this.today());
    if (state === 'none') {
      return null;
    }
    return {
      tone: state === 'expired' ? ('danger' as const) : ('warn' as const),
      text: expiryLabel(expiresAt, this.today()),
    };
  });

  protected readonly hasMore = computed(() => this.movements().length < this.total());
  protected readonly nextPage = computed(() => this.loaded());

  constructor() {
    effect(() => {
      const item = this.item();
      const open = this.open();
      // Cada apertura empieza de cero: el historial del artículo anterior no tiene nada que
      // hacer bajo el nombre de este, y en el hueco entre abrir y responder se vería.
      //
      // `untracked` no es opcional: `load` lee `loading` para no pisarse a sí misma, y sin
      // aislarlo el efecto pasa a depender de esa señal. Entonces se redispara con cada
      // cambio suyo y pide la bitácora una y otra vez, sin parar.
      if (open && item) {
        untracked(() => {
          this.reset();
          this.load(0);
        });
      }
    });
  }

  protected describe(movement: StockMovement): string {
    const quien = movement.performedByName;
    return quien ? `${movementLabel(movement.type)} · ${quien}` : movementLabel(movement.type);
  }

  protected when(movement: StockMovement): string {
    return new Intl.DateTimeFormat('es-CL', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(movement.performedAt));
  }

  /** El signo va delante SIEMPRE, también en las entradas: un «+6» dice qué pasó sin leer más. */
  protected signed(movement: StockMovement): string {
    const amount = formatQuantity(Math.abs(movement.delta));
    return `${movement.delta > 0 ? '+' : '−'}${amount}`;
  }

  protected load(page: number): void {
    const item = this.item();
    if (!item || this.loading()) {
      return;
    }
    this.loading.set(true);
    this.failed.set(false);
    this.api.movements(this.householdId(), item.id, page, PAGE_SIZE).subscribe({
      next: (result) => {
        this.movements.update((current) =>
          page === 0 ? result.content : [...current, ...result.content]);
        this.total.set(result.totalElements);
        this.loaded.set(page + 1);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });
  }

  private reset(): void {
    this.movements.set([]);
    this.total.set(0);
    this.loaded.set(0);
    this.failed.set(false);
  }
}
