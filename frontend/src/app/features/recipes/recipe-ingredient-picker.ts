import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { CatalogApi } from '../../core/pantry/catalog.api';
import { unitLabel } from '../../core/pantry/pantry.models';
import type { PantryProduct, ProductUnit } from '../../core/pantry/pantry.models';
import { ViewportService } from '../../core/layout/viewport.service';
import { BottomSheet } from '../../shared/ui/bottom-sheet';
import { Button } from '../../shared/ui/button';
import { Dialog } from '../../shared/ui/dialog';
import { Icon } from '../../shared/ui/icon';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import type { SelectOption } from '../../shared/ui/select';

const UNITS: readonly SelectOption[] = [
  { value: 'UNIT', label: 'Unidades' },
  { value: 'G', label: 'Gramos' },
  { value: 'KG', label: 'Kilos' },
  { value: 'ML', label: 'Mililitros' },
  { value: 'L', label: 'Litros' },
  { value: 'PACK', label: 'Paquetes' },
];

const SEARCH_DEBOUNCE_MS = 250;
const MIN_SEARCH = 1;

/** Lo que se emite al confirmar: o un producto ya existente, o uno por crear. */
export interface IngredientChosen {
  readonly product: PantryProduct | null;
  readonly name: string;
  readonly unit: ProductUnit;
  readonly quantity: number;
  readonly optional: boolean;
}

/**
 * Añadir un ingrediente a la receta.
 *
 * <p>Mismo patrón de tres ramas que `add-item-panel.ts` (D11 en reglas-despensa.md, R4 en
 * reglas-recetas.md): elegir una sugerencia no pregunta nada, escribir el nombre exacto de
 * un producto del catálogo ES elegirlo, y sólo cuando el nombre no existe se pregunta la
 * unidad. La diferencia con la despensa: aquí no se manda nada al servidor —el ingrediente
 * se resuelve al guardar la receta entera—, así que este panel sólo emite lo elegido.
 */
@Component({
  selector: 'app-recipe-ingredient-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BottomSheet, Button, Dialog, FormsModule, Icon, Input, NgTemplateOutlet, Select],
  template: `
    <ng-template #formulario>
      <form class="flex flex-col gap-4" (ngSubmit)="submit()">
        <div class="flex flex-col gap-1.5">
          <ui-input
            label="Ingrediente"
            name="ingrediente"
            placeholder="Huevos, harina…"
            autocomplete="off"
            [error]="nameError()"
            [ngModelOptions]="{ standalone: true }"
            [ngModel]="name()"
            (ngModelChange)="onNameChange($event)" />

          @if (showSuggestions()) {
            <ul class="flex list-none flex-col gap-0.5 p-0" aria-label="Productos del hogar">
              @for (product of suggestions(); track product.id) {
                <li>
                  <button type="button" class="sugerencia" (click)="choose(product)">
                    <span class="truncate">{{ product.name }}</span>
                    <span class="flex-none text-[13px] text-text-muted">{{ unitLabel(product.unit) }}</span>
                  </button>
                </li>
              }
              <li>
                <button type="button" class="sugerencia" (click)="startCreating()">
                  <span class="flex items-center gap-2 truncate text-accent">
                    <ui-icon name="plus" [size]="16" />
                    Crear «{{ name().trim() }}»
                  </span>
                </button>
              </li>
            </ul>
          }
        </div>

        @if (product(); as producto) {
          <p class="flex items-center gap-2 rounded-sm bg-surface-sunken px-3 py-2.5 text-[13px] text-text-muted">
            <ui-icon name="info" [size]="16" />
            <span>Este hogar mide «{{ producto.name }}» en {{ unitLabel(producto.unit) }}.</span>
          </p>
        } @else if (isNew()) {
          <div class="flex flex-col gap-2">
            <p class="text-[13px] text-text-muted">
              «{{ name().trim() }}» es nuevo en este hogar. Elige cómo lo mides: no se podrá
              cambiar después.
            </p>
            <ui-select
              label="Unidad"
              name="unidad"
              [options]="units"
              [ngModelOptions]="{ standalone: true }"
              [ngModel]="unit()"
              (ngModelChange)="unit.set($event)" />
          </div>
        }

        <ui-input
          label="Cantidad"
          name="cantidad"
          type="text"
          inputMode="decimal"
          autocomplete="off"
          [error]="quantityError()"
          [ngModelOptions]="{ standalone: true }"
          [ngModel]="quantity()"
          (ngModelChange)="quantity.set($event)" />

        <label class="flex min-h-[var(--touch-min)] items-center gap-2.5 text-[14px] text-text">
          <input type="checkbox" class="h-[18px] w-[18px] accent-[var(--accent)]"
            [checked]="optional()" (change)="optional.set(!optional())" />
          Opcional — no cuenta para decidir si la receta está lista
        </label>

        <div class="flex justify-end gap-2 pt-1">
          <ui-button variant="secondary" (pressed)="close()">Cancelar</ui-button>
          <ui-button type="submit">Añadir</ui-button>
        </div>
      </form>
    </ng-template>

    @if (isDesktop()) {
      <ui-dialog [open]="open()" title="Añadir ingrediente" (closed)="close()">
        <ng-container *ngTemplateOutlet="formulario" />
      </ui-dialog>
    } @else {
      <ui-bottom-sheet [open]="open()" title="Añadir ingrediente" (closed)="close()">
        <ng-container *ngTemplateOutlet="formulario" />
      </ui-bottom-sheet>
    }
  `,
  styles: `
    :host { display: contents; }

    .sugerencia {
      display: flex;
      width: 100%;
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
export class RecipeIngredientPicker {
  private readonly catalog = inject(CatalogApi);
  private readonly viewport = inject(ViewportService);

  readonly open = input(false);
  readonly householdId = input.required<string>();

  readonly closed = output<void>();
  readonly chosen = output<IngredientChosen>();

  protected readonly isDesktop = this.viewport.isDesktop;
  protected readonly units = UNITS;
  protected readonly unitLabel = unitLabel;

  protected readonly name = signal('');
  protected readonly unit = signal<string>('UNIT');
  protected readonly quantity = signal('');
  protected readonly optional = signal(false);
  protected readonly chosenProduct = signal<PantryProduct | null>(null);
  protected readonly suggestions = signal<readonly PantryProduct[]>([]);

  private readonly searched = signal<string | null>(null);
  private readonly creating = signal(false);

  protected readonly nameError = signal('');
  protected readonly quantityError = signal('');

  private readonly term = computed(() => (this.chosenProduct() ? '' : this.name().trim()));

  protected readonly product = computed<PantryProduct | null>(() => {
    const chosen = this.chosenProduct();
    if (chosen) {
      return chosen;
    }
    const typed = this.name().trim().toLowerCase();
    return this.suggestions().find((p) => p.name.toLowerCase() === typed) ?? null;
  });

  protected readonly isNew = computed(() => {
    if (this.product() || this.name().trim().length === 0) {
      return false;
    }
    if (this.creating()) {
      return true;
    }
    return this.searched() === this.name().trim() && this.suggestions().length === 0;
  });

  protected readonly showSuggestions = computed(() =>
    this.suggestions().length > 0 && !this.product() && !this.creating());

  constructor() {
    toObservable(this.term)
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((term) => {
          if (term.length < MIN_SEARCH) {
            return of({ term, products: [] as readonly PantryProduct[] });
          }
          return this.catalog.search(this.householdId(), term).pipe(
            map((products) => ({ term, products })),
            catchError(() => of({ term, products: [] as readonly PantryProduct[] })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ term, products }) => {
        this.suggestions.set(products);
        this.searched.set(term);
      });

    effect(() => {
      if (this.open()) {
        this.reset();
      }
    });
  }

  protected onNameChange(value: string): void {
    this.name.set(value);
    this.nameError.set('');
    this.creating.set(false);
    if (this.chosenProduct() && value !== this.chosenProduct()?.name) {
      this.chosenProduct.set(null);
    }
  }

  protected startCreating(): void {
    this.creating.set(true);
  }

  protected choose(product: PantryProduct): void {
    this.chosenProduct.set(product);
    this.name.set(product.name);
    this.unit.set(product.unit);
    this.suggestions.set([]);
    this.nameError.set('');
  }

  protected close(): void {
    this.closed.emit();
  }

  protected submit(): void {
    const name = this.name().trim();
    const quantity = Number.parseFloat(this.quantity().replace(',', '.'));

    this.nameError.set(name ? '' : 'Escribe qué ingrediente hace falta.');
    this.quantityError.set(
      Number.isNaN(quantity) || quantity <= 0 ? 'Escribe cuánto hace falta. Mayor que cero.' : '');
    if (this.nameError() || this.quantityError()) {
      return;
    }

    this.chosen.emit({
      product: this.product(),
      name,
      unit: this.unit() as ProductUnit,
      quantity,
      optional: this.optional(),
    });
    this.closed.emit();
  }

  private reset(): void {
    this.name.set('');
    this.unit.set('UNIT');
    this.quantity.set('');
    this.optional.set(false);
    this.chosenProduct.set(null);
    this.creating.set(false);
    this.suggestions.set([]);
    this.searched.set(null);
    this.nameError.set('');
    this.quantityError.set('');
  }
}
