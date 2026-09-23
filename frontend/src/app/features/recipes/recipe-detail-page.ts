import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { HouseholdContextService } from '../../core/household/household-context.service';
import { RecipeDetailStore } from '../../core/recipes/recipe-detail-store';
import type { RecipeIngredientAvailability } from '../../core/recipes/recipe.models';
import { formatQuantity, unitLabel } from '../../core/pantry/pantry.models';
import { ToastService } from '../../core/toast/toast.service';
import { ViewportService } from '../../core/layout/viewport.service';
import { BottomSheet } from '../../shared/ui/bottom-sheet';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { Dialog } from '../../shared/ui/dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { Skeleton } from '../../shared/ui/skeleton';
import type { BadgeTone } from '../../shared/ui/badge';

/** Interfaz mínima del navegador para Wake Lock, que TypeScript no tipa todavía por defecto. */
interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}
interface NavigatorWithWakeLock {
  readonly wakeLock: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
}

/**
 * El detalle de una receta: estructura y disponibilidad combinadas —dos endpoints, una
 * pantalla, ver `RecipeDetailStore`—, con su modo cocina y la acción de descontar.
 *
 * <p>El Wake Lock sigue el mismo patrón que `navigator.share` en el reporte de compras
 * (P5 en reglas-plantillas.md): se detecta una vez como señal, y pedirlo es un intento con
 * captura silenciosa. Sin permiso, sin batería suficiente o sin soporte, la pantalla se
 * apagará como siempre — no es un error que deba interrumpir a alguien cocinando.
 */
@Component({
  selector: 'app-recipe-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // RecipeDetailStore es @Injectable() sin providedIn: cada visita a una receta necesita su
  // propia instancia, no una compartida entre navegaciones (RecipeEditorStore es igual, por
  // la misma razón).
  providers: [RecipeDetailStore],
  imports: [Badge, BottomSheet, Button, Dialog, EmptyState, Icon, NgTemplateOutlet, RouterLink, Skeleton],
  template: `
    @if (store.isLoading() && !store.loaded()) {
      <div class="mx-auto flex w-full max-w-2xl flex-col gap-3 pb-4" aria-busy="true">
        <ui-skeleton width="50%" height="24px" label="Cargando la receta" />
        <ui-skeleton width="80%" height="14px" />
        <ui-skeleton width="100%" height="120px" />
      </div>
    } @else if (store.hasError()) {
      <ui-empty-state icon="warning-circle" title="No pudimos cargar la receta"
        description="Puede ser la conexión.">
        <ui-button icon="arrows-clockwise" (pressed)="store.reload()">Reintentar</ui-button>
      </ui-empty-state>
    } @else if (store.loaded()) {
      @if (!cooking()) {
        <div class="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-8">
          <div class="flex items-center justify-between gap-3">
            <a routerLink="../"
              class="flex items-center gap-1.5 text-[14px] font-medium text-text-muted
                     hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2
                     focus-visible:outline-accent">
              <ui-icon name="arrow-left" [size]="18" />
              Recetas
            </a>
            <a routerLink="edit"
              class="flex items-center gap-1.5 text-[14px] font-medium text-accent
                     hover:underline focus-visible:outline-2 focus-visible:outline-offset-2
                     focus-visible:outline-accent">
              <ui-icon name="pencil-simple" [size]="16" />
              Editar
            </a>
          </div>

          <div class="flex flex-col gap-2">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <h1 class="font-display text-[24px] font-semibold tracking-tight text-text">
                {{ store.recipe()!.name }}
              </h1>
              <ui-badge [tone]="availabilityTone()">{{ availabilityLabel() }}</ui-badge>
            </div>
            @if (store.recipe()!.description; as description) {
              <p class="text-[14px] leading-relaxed text-text-muted">{{ description }}</p>
            }
            @if (store.recipe()!.servings || store.recipe()!.prepMinutes) {
              <div class="flex flex-wrap gap-4 text-[13px] text-text-muted">
                @if (store.recipe()!.servings; as servings) {
                  <span class="flex items-center gap-1.5">
                    <ui-icon name="users" [size]="16" />
                    {{ servings }} {{ servings === 1 ? 'ración' : 'raciones' }}
                  </span>
                }
                @if (store.recipe()!.prepMinutes; as minutos) {
                  <span class="flex items-center gap-1.5">
                    <ui-icon name="hourglass-medium" [size]="16" />
                    {{ minutos }} min
                  </span>
                }
              </div>
            }
          </div>

          <section class="flex flex-col gap-2">
            <h2 class="text-[13px] font-medium text-text-muted">Ingredientes</h2>
            <ul class="flex list-none flex-col gap-2 p-0">
              @for (item of store.availability()!.items; track item.productId) {
                <li class="flex items-center justify-between gap-3 rounded-md border
                           border-border bg-surface-raised p-3">
                  <div class="flex min-w-0 items-center gap-2.5">
                    <ui-icon [name]="item.sufficient ? 'check-circle' : 'warning'" [size]="18"
                      class="flex-none" [class.text-ok]="item.sufficient" [class.text-warn]="!item.sufficient" />
                    <div class="min-w-0">
                      <span class="block truncate text-[14px] text-text">{{ item.productName }}</span>
                      @if (item.optional) {
                        <span class="text-[12px] text-text-muted">Opcional</span>
                      }
                    </div>
                  </div>
                  <div class="flex-none text-right text-[13px] tabular-nums">
                    <span class="block text-text">{{ formatQuantity(item.quantity) }} {{ unitLabel(item.unit) }}</span>
                    @if (item.sufficient) {
                      <span class="block text-text-muted">Tienes {{ formatQuantity(item.availableQuantity) }}</span>
                    } @else {
                      <span class="block text-warn">Faltan {{ formatQuantity(item.missingQuantity) }}</span>
                    }
                  </div>
                </li>
              }
            </ul>
          </section>

          @if (store.recipe()!.steps.length > 0) {
            <section class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <h2 class="text-[13px] font-medium text-text-muted">Pasos</h2>
                <ui-button icon="fork-knife" (pressed)="startCooking()">Modo cocina</ui-button>
              </div>
              <ol class="flex list-none flex-col gap-3 p-0">
                @for (paso of store.recipe()!.steps; track paso.position) {
                  <li class="flex gap-3 rounded-md border border-border bg-surface-raised p-4">
                    <span class="flex h-7 w-7 flex-none items-center justify-center rounded-full
                                 bg-accent-weak text-[13px] font-semibold text-accent">
                      {{ paso.position }}
                    </span>
                    <p class="text-[15px] leading-relaxed text-text">{{ paso.instruction }}</p>
                  </li>
                }
              </ol>
            </section>
          }

          @if (canDecrement()) {
            <ui-button variant="secondary" icon="minus" (pressed)="confirmingDecrement.set(true)">
              Descontar ingredientes de la despensa
            </ui-button>
          }
        </div>

        <!-- Confirmación de descuento: diálogo en escritorio, hoja en móvil. Mismo contenido. -->
        <ng-template #confirmacion>
          <p class="mb-3 text-[14px] text-text-muted">
            Esto es lo que se va a descontar de la despensa. Lo que no está en tu despensa no se toca.
          </p>
          <ul class="mb-4 flex list-none flex-col gap-1.5 p-0">
            @for (linea of store.decrementable(); track linea.pantryItemId) {
              <li class="flex items-center justify-between text-[14px]">
                <span class="text-text">{{ linea.productName }}</span>
                <span class="tabular-nums text-danger">−{{ formatQuantity(linea.quantity) }} {{ unitLabel(linea.unit) }}</span>
              </li>
            }
          </ul>
          <div class="flex justify-end gap-2">
            <ui-button variant="secondary" (pressed)="confirmingDecrement.set(false)">Cancelar</ui-button>
            <ui-button (pressed)="decrement()">Descontar</ui-button>
          </div>
        </ng-template>

        @if (isDesktop()) {
          <ui-dialog title="Descontar ingredientes" [open]="confirmingDecrement()" (closed)="confirmingDecrement.set(false)">
            <ng-container [ngTemplateOutlet]="confirmacion" />
          </ui-dialog>
        } @else {
          <ui-bottom-sheet title="Descontar ingredientes" [open]="confirmingDecrement()" (closed)="confirmingDecrement.set(false)">
            <ng-container [ngTemplateOutlet]="confirmacion" />
          </ui-bottom-sheet>
        }
      } @else {
        <!-- ============ MODO COCINA ============
             Texto grande, alto contraste, avance por toque. Botones explícitos además del
             toque: un control que sólo funciona al azar sobre la pantalla no es accesible
             por teclado ni descubrible para quien no lo prueba. -->
        <div class="fixed inset-0 z-40 flex flex-col bg-surface" role="dialog" aria-modal="true"
          [attr.aria-label]="'Modo cocina: ' + store.recipe()!.name">
          <div class="flex items-center justify-between border-b border-border px-4
                      pb-3 pt-[max(12px,env(safe-area-inset-top))]">
            <span class="text-[13px] font-medium text-text-muted">
              Paso {{ currentStep() + 1 }} de {{ store.recipe()!.steps.length }}
            </span>
            <ui-button variant="ghost" size="sm" icon="x" (pressed)="stopCooking()">Salir</ui-button>
          </div>

          <button type="button"
            class="flex flex-1 items-center justify-center overflow-y-auto p-8 text-left"
            (click)="nextStep()">
            <p class="max-w-[52ch] font-display text-[28px] font-medium leading-snug tracking-tight text-text">
              {{ currentStepText() }}
            </p>
          </button>

          <div class="flex gap-2 border-t border-border p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
            <ui-button variant="secondary" [block]="true" [disabled]="currentStep() === 0" (pressed)="previousStep()">
              Anterior
            </ui-button>
            @if (isLastStep()) {
              <ui-button [block]="true" icon="check" (pressed)="stopCooking()">Terminar</ui-button>
            } @else {
              <ui-button [block]="true" (pressed)="nextStep()">Siguiente</ui-button>
            }
          </div>
        </div>
      }
    }
  `,
  styles: `:host { display: block; }`,
})
export class RecipeDetailPage {
  protected readonly store = inject(RecipeDetailStore);
  private readonly route = inject(ActivatedRoute);
  private readonly householdId = inject(HouseholdContextService).householdId;
  private readonly toasts = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly isDesktop = inject(ViewportService).isDesktop;

  protected readonly cooking = signal(false);
  protected readonly currentStep = signal(0);
  protected readonly confirmingDecrement = signal(false);

  private readonly canWakeLock = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  private wakeLock: WakeLockSentinelLike | null = null;

  protected readonly canDecrement = computed(
    () => this.store.pantryReady() && this.store.decrementable().length > 0,
  );

  protected readonly isLastStep = computed(() => {
    const steps = this.store.recipe()?.steps.length ?? 0;
    return this.currentStep() >= steps - 1;
  });

  protected readonly currentStepText = computed(
    () => this.store.recipe()?.steps[this.currentStep()]?.instruction ?? '',
  );

  protected readonly formatQuantity = formatQuantity;
  protected readonly unitLabel = unitLabel;

  constructor() {
    const recipeId = this.route.snapshot.paramMap.get('recipeId');
    const householdId = this.householdId();
    if (recipeId && householdId) {
      this.store.load(householdId, recipeId);
    }

    document.addEventListener('visibilitychange', this.reacquireOnVisible);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', this.reacquireOnVisible);
      void this.releaseWakeLock();
    });
  }

  protected startCooking(): void {
    this.cooking.set(true);
    this.currentStep.set(0);
    void this.requestWakeLock();
  }

  protected stopCooking(): void {
    this.cooking.set(false);
    void this.releaseWakeLock();
  }

  protected nextStep(): void {
    const total = this.store.recipe()?.steps.length ?? 0;
    this.currentStep.update((step) => Math.min(step + 1, Math.max(total - 1, 0)));
  }

  protected previousStep(): void {
    this.currentStep.update((step) => Math.max(step - 1, 0));
  }

  protected decrement(): void {
    this.store.decrementAll();
    this.confirmingDecrement.set(false);
    this.toasts.success('Despensa actualizada', 'Se descontaron los ingredientes que tenías.');
  }

  protected availabilityTone(): BadgeTone {
    return this.store.availability()!.availability === 'READY' ? 'ok' : 'warn';
  }

  protected availabilityLabel(): string {
    const report = this.store.availability()!;
    if (report.availability === 'READY') {
      return 'Puedes cocinarla';
    }
    return report.missingCount === 0
      ? 'Sin ingredientes obligatorios'
      : report.missingCount === 1 ? 'Falta 1 ingrediente' : `Faltan ${report.missingCount} ingredientes`;
  }

  private readonly reacquireOnVisible = (): void => {
    // El navegador libera el Wake Lock solo al ocultar la pestaña, y no lo recupera
    // solo: sin esto, volver de cambiar de app dejaría la pantalla apagándose de nuevo
    // a media receta, en silencio.
    if (this.cooking() && document.visibilityState === 'visible') {
      void this.requestWakeLock();
    }
  };

  private async requestWakeLock(): Promise<void> {
    if (!this.canWakeLock) {
      return;
    }
    try {
      const sentinel = await (navigator as unknown as NavigatorWithWakeLock).wakeLock.request('screen');
      this.wakeLock = sentinel;
      sentinel.addEventListener('release', () => {
        this.wakeLock = null;
      });
    } catch {
      // Sin permiso, sin batería suficiente, o sencillamente no soportado pese al
      // feature-detect: la pantalla se apagará como siempre. No es un error que deba
      // interrumpir a alguien cocinando.
    }
  }

  private async releaseWakeLock(): Promise<void> {
    try {
      await this.wakeLock?.release();
    } catch {
      // Ya liberado, o nunca llegó a concederse.
    }
    this.wakeLock = null;
  }
}
