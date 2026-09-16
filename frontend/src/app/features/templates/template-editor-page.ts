import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { HouseholdContextService } from '../../core/household/household-context.service';
import { ViewportService } from '../../core/layout/viewport.service';
import { CatalogApi } from '../../core/pantry/catalog.api';
import { formatQuantity, stepFor, unitLabel } from '../../core/pantry/pantry.models';
import { TemplateEditorStore } from '../../core/templates/template-editor-store';
import type { DraftItem } from '../../core/templates/template-editor-store';
import type { CatalogProduct } from '../../core/templates/template.models';
import { ToastService } from '../../core/toast/toast.service';
import { BottomSheet } from '../../shared/ui/bottom-sheet';
import { Button } from '../../shared/ui/button';
import { Dialog } from '../../shared/ui/dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { IconButton } from '../../shared/ui/icon-button';
import { Input } from '../../shared/ui/input';
import { QuantityStepper } from '../../shared/ui/quantity-stepper';
import { Skeleton } from '../../shared/ui/skeleton';

const SEARCH_DEBOUNCE_MS = 250;

/**
 * El editor de una plantilla: qué productos la componen y cuánto se quiere de cada uno.
 *
 * <p>Se guarda a mano. El endpoint reemplaza la lista entera, así que guardar solo mandaría
 * la lista completa por cada tecla y dos miembros editando a la vez se pisarían sin enterarse.
 * Con un botón, el momento en que una versión gana lo decide alguien.
 *
 * <p>Eso obliga a dos cosas que el guardado automático no necesita, y las dos están: decir
 * cuándo hay cambios sin guardar, y avisar antes de salir con ellos.
 */
@Component({
  selector: 'app-template-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TemplateEditorStore],
  imports: [
    BottomSheet, Button, Dialog, EmptyState, FormsModule, Icon, IconButton, Input,
    NgTemplateOutlet, QuantityStepper, RouterLink, Skeleton,
  ],
  template: `
    <div class="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-4">

      <!-- ============ CABECERA ============ -->
      <div class="flex flex-col gap-3 border-b border-border pb-4">
        <a
          class="flex w-fit items-center gap-1.5 text-[13px] text-text-muted
                 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2
                 focus-visible:outline-accent"
          [routerLink]="['../']">
          <ui-icon name="arrow-left" [size]="16" />
          <span>Plantillas</span>
        </a>

        @if (store.template(); as template) {
          <h1 class="font-display text-[24px] font-semibold tracking-tight text-text">
            {{ template.name }}
          </h1>
        }

        <div class="flex flex-wrap items-center justify-between gap-3">
          <!-- El estado de guardado es texto, no un icono: «sin guardar» tiene que poder
               leerse de un vistazo por alguien que no conoce la convención del punto. -->
          <span class="text-[13px]" [class.text-warn]="store.isDirty()"
                [class.text-text-muted]="!store.isDirty()">
            {{ savedLabel() }}
          </span>

          <div class="flex items-center gap-2">
            <ui-button
              variant="secondary"
              icon="list-checks"
              [disabled]="store.isDirty()"
              [title]="store.isDirty() ? 'Guarda los cambios para ver el reporte actualizado' : ''"
              [link]="['report']">
              Generar reporte
            </ui-button>
            <ui-button
              [disabled]="!store.isDirty()"
              [loading]="store.isSaving()"
              (pressed)="store.save()">
              Guardar
            </ui-button>
          </div>
        </div>

        @if (store.error(); as error) {
          <p class="text-[13px] text-danger" role="alert">{{ error }}</p>
        }
      </div>

      <!-- ============ AÑADIR ============ -->
      @if (store.loaded()) {
        <div class="flex flex-col gap-1.5">
          <ui-input
            label="Agregar un producto"
            name="buscar"
            placeholder="Huevos, salsa de tomate…"
            autocomplete="off"
            [ngModelOptions]="{ standalone: true }"
            [ngModel]="search()"
            (ngModelChange)="search.set($event)" />

          @if (suggestions().length > 0) {
            <!-- Con superficie propia: sin ella, las sugerencias quedan entre el campo y las
                 líneas de la plantilla y se leen como si ya formaran parte de ella. -->
            <ul
              class="flex list-none flex-col gap-0.5 rounded-md border border-border
                     bg-surface-raised p-1 shadow-e2"
              aria-label="Productos del hogar">
              @for (product of suggestions(); track product.id) {
                <li>
                  <button type="button" class="sugerencia" (click)="add(product)">
                    <span class="truncate">{{ product.name }}</span>
                    <span class="flex-none text-[13px] text-text-muted">
                      {{ unitOf(product) }}
                    </span>
                  </button>
                </li>
              }
            </ul>
          } @else if (search().trim().length > 0 && searched()) {
            <p class="px-1 text-[13px] text-text-muted">
              No hay ningún producto así en el catálogo del hogar. Agrégalo primero desde la
              despensa.
            </p>
          }
        </div>
      }

      <!-- ============ LÍNEAS ============ -->
      @if (store.isLoading()) {
        <div class="flex flex-col gap-2" aria-busy="true">
          @for (fila of [1, 2, 3, 4]; track fila) {
            <div class="flex items-center justify-between gap-3 rounded-md border border-border
                        bg-surface-raised p-3">
              <ui-skeleton width="45%" height="15px" label="Cargando la plantilla" />
              <ui-skeleton width="140px" height="44px" radius="10px" />
            </div>
          }
        </div>
      } @else if (store.hasError()) {
        <ui-empty-state
          icon="warning-circle"
          title="No pudimos cargar la plantilla"
          description="Puede ser la conexión. Lo que tengas guardado sigue a salvo." />
      } @else if (store.items().length === 0) {
        <ui-empty-state
          icon="list-checks"
          title="Esta plantilla está vacía"
          description="Busca arriba un producto del hogar y di cuánto quieres tener de él." />
      } @else {
        <ul class="flex list-none flex-col gap-2 p-0">
          @for (item of store.items(); track item.key) {
            <li>
              <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-3
                          rounded-md border border-border bg-surface-raised p-3 shadow-e1">
                <div class="flex min-w-0 flex-1 basis-[9rem] flex-col gap-0.5">
                  <span class="truncate text-[15px] font-medium text-text">
                    {{ item.productName }}
                  </span>
                  @if (item.category) {
                    <span class="truncate text-[13px] text-text-muted">{{ item.category }}</span>
                  }
                </div>

                <!-- ml-auto: al envolverse, el control se va al borde derecho igual que en
                     la despensa. El mismo control en dos listas tiene que caer en el mismo
                     sitio, o la columna de cifras deja de existir al cambiar de pantalla. -->
                <div class="ml-auto flex flex-none items-center gap-1">
                  <ui-quantity-stepper
                    [value]="item.desiredQuantity"
                    [unit]="unitLabelOf(item)"
                    [step]="stepOf(item)"
                    [max]="999999"
                    [label]="'Cantidad deseada de ' + item.productName"
                    (changed)="store.setQuantity(item.key, $event.value)" />

                  <ui-icon-button
                    name="trash"
                    [label]="'Quitar ' + item.productName"
                    (pressed)="remove(item)" />
                </div>
              </div>
            </li>
          }
        </ul>
      }
    </div>

    <!-- ============ CONFIRMACIÓN AL SALIR ============ -->
    <ng-template #confirmacion>
      <div class="flex flex-col gap-4">
        <p class="text-[15px] text-text">
          Los cambios en esta plantilla todavía no se han guardado. Si sales ahora se pierden.
        </p>
        <div class="flex justify-end gap-2">
          <ui-button variant="secondary" (pressed)="resolveLeave(false)">Seguir editando</ui-button>
          <ui-button variant="danger" (pressed)="resolveLeave(true)">Salir sin guardar</ui-button>
        </div>
      </div>
    </ng-template>

    @if (isDesktop()) {
      <ui-dialog [open]="asking()" title="Tienes cambios sin guardar" (closed)="resolveLeave(false)">
        <ng-container *ngTemplateOutlet="confirmacion" />
      </ui-dialog>
    } @else {
      <ui-bottom-sheet [open]="asking()" title="Tienes cambios sin guardar" (closed)="resolveLeave(false)">
        <ng-container *ngTemplateOutlet="confirmacion" />
      </ui-bottom-sheet>
    }
  `,
  styles: `
    :host { display: block; }

    .sugerencia {
      display: flex;
      width: 100%;
      /* Mismo minimo que en el panel de agregar de la despensa: el relleno solo sumaba 43px.
         Aqui no lo delato ninguna comprobacion porque las escenas del editor no miden areas
         tactiles todavia; se arregla igual. */
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
    .sugerencia:hover { background: var(--surface-sunken); }
    .sugerencia:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  `,
})
export class TemplateEditorPage {
  protected readonly store = inject(TemplateEditorStore);
  private readonly catalog = inject(CatalogApi);
  private readonly toasts = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly context = inject(HouseholdContextService);

  protected readonly isDesktop = inject(ViewportService).isDesktop;

  protected readonly search = signal('');
  protected readonly suggestions = signal<readonly CatalogProduct[]>([]);
  protected readonly searched = signal(false);

  /** Abierta cuando alguien intenta salir con cambios pendientes. */
  protected readonly asking = signal(false);
  private leaveDecision: ((leave: boolean) => void) | null = null;

  protected readonly savedLabel = computed(() => {
    if (!this.store.loaded()) {
      return '';
    }
    return this.store.isDirty() ? 'Cambios sin guardar' : 'Todo guardado';
  });

  constructor() {
    const householdId = this.context.householdId();
    const templateId = this.route.snapshot.paramMap.get('templateId');
    if (householdId && templateId) {
      this.store.load(householdId, templateId);
    }

    toObservable(this.search)
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((term) => {
          const texto = term.trim();
          if (!texto) {
            return of({ productos: [] as readonly CatalogProduct[], buscado: false });
          }
          return this.catalog.search(householdId ?? '', texto).pipe(
            map((productos) => ({ productos, buscado: true })),
            catchError(() => of({ productos: [] as readonly CatalogProduct[], buscado: true })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ productos, buscado }) => {
        // Lo que ya está en la plantilla no se ofrece: añadirlo dos veces no significa nada
        // y el servidor lo rechazaría.
        const puestos = new Set(this.store.items().map((item) => item.productId));
        this.suggestions.set(productos.filter((p) => !puestos.has(p.id)));
        this.searched.set(buscado);
      });

    // El aviso del navegador al cerrar la pestaña. El de navegar dentro de la aplicación lo
    // pone el guard, porque Angular no dispara este evento en una navegación de cliente.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (this.store.isDirty()) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('beforeunload', onBeforeUnload));
  }

  protected unitOf(product: CatalogProduct): string {
    return unitLabel(product.unit);
  }

  protected unitLabelOf(item: DraftItem): string {
    return unitLabel(item.unit);
  }

  protected stepOf(item: DraftItem): number {
    return stepFor(item.unit);
  }

  protected add(product: CatalogProduct): void {
    this.store.add(product, stepFor(product.unit));
    this.search.set('');
    this.suggestions.set([]);
    this.searched.set(false);
  }

  /**
   * Quitar con deshacer.
   *
   * <p>El deshacer vive en el aviso porque quitar una línea es barato de hacer y caro de
   * reconstruir: hay que recordar el producto y la cantidad. Y vuelve a SU sitio, no al final:
   * una lista que se reordena sola al deshacer no es la que había antes.
   */
  protected remove(item: DraftItem): void {
    const quitado = this.store.remove(item.key);
    if (!quitado) {
      return;
    }
    this.toasts.show('info', `Quitaste ${item.productName}`, undefined, {
      label: 'Deshacer',
      run: () => this.store.restore(quitado.item, quitado.index),
    });
  }

  /** La respuesta del guard: `true` deja salir. */
  askToLeave(): Promise<boolean> {
    if (!this.store.isDirty()) {
      return Promise.resolve(true);
    }
    this.asking.set(true);
    return new Promise<boolean>((resolve) => {
      this.leaveDecision = resolve;
    });
  }

  protected resolveLeave(leave: boolean): void {
    this.asking.set(false);
    this.leaveDecision?.(leave);
    this.leaveDecision = null;
  }
}
