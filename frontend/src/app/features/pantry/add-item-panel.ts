import { HttpErrorResponse } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { CatalogApi } from '../../core/pantry/catalog.api';
import { PantryApi } from '../../core/pantry/pantry.api';
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

/** Lo que el usuario puede elegir al crear un producto que el hogar no conocía. */
const UNITS: readonly SelectOption[] = [
  { value: 'UNIT', label: 'Unidades' },
  { value: 'G', label: 'Gramos' },
  { value: 'KG', label: 'Kilos' },
  { value: 'ML', label: 'Mililitros' },
  { value: 'L', label: 'Litros' },
  { value: 'PACK', label: 'Paquetes' },
];

const SEARCH_DEBOUNCE_MS = 250;

/** Desde una letra: hay productos de nombre corto, y esperar a la segunda se nota. */
const MIN_SEARCH = 1;

/**
 * Agregar algo a la despensa.
 *
 * <p>El formulario es uno solo; lo que cambia es el envase: hoja inferior donde el pulgar
 * llega, y diálogo centrado donde hay ratón. Se monta UNO, no los dos ocultándose por CSS:
 * los dos son `<dialog>` y montarlos a la vez apilaría dos capas modales.
 *
 * <p>Los campos van como `standalone`. Dentro de un `<form>`, `ngModel` se registra en el
 * `NgForm` y **aplaza** el paso de la vista al modelo, así que `(ngModelChange)` llega un
 * tick tarde; aquí el estado son señales propias y del formulario sólo se quiere el envío con
 * Enter, no su modelo. Fuera del form no pasaba y dentro sí: lo cazó una sonda.
 *
 * <p>El campo de nombre busca en el catálogo del hogar mientras se escribe. Elegir una
 * sugerencia fija la unidad y la deja de sólo lectura, porque **la unidad es parte de la
 * identidad del producto**: cambiarla reinterpretaría todo lo ya registrado. Sólo cuando el
 * nombre no existe se pregunta en qué se mide.
 */
@Component({
  selector: 'app-add-item-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BottomSheet, Button, Dialog, FormsModule, Icon, Input, NgTemplateOutlet, Select],
  template: `
    <ng-template #formulario>
      <form class="flex flex-col gap-4" (ngSubmit)="submit()">
        <div class="flex flex-col gap-1.5">
          <ui-input
            label="Producto"
            name="producto"
            placeholder="Huevos, salsa de tomate…"
            autocomplete="off"
            [error]="nameError()"
            [ngModelOptions]="{ standalone: true }"
            [ngModel]="name()"
            (ngModelChange)="onNameChange($event)" />

          @if (showSuggestions()) {
            <ul class="flex list-none flex-col gap-0.5 p-0" aria-label="Productos del hogar">
              @for (product of suggestions(); track product.id) {
                <li>
                  <button
                    type="button"
                    class="sugerencia"
                    (click)="choose(product)">
                    <span class="truncate">{{ product.name }}</span>
                    <span class="flex-none text-[13px] text-text-muted">
                      {{ unitOf(product) }}
                    </span>
                  </button>
                </li>
              }

              <!-- Crear se ofrece COMO UNA OPCIÓN MÁS, no como un estado que la pantalla
                   deduzca. Con tres «leche» en la lista, decir a la vez que el nombre es
                   nuevo son dos afirmaciones contrarias; aquí el usuario elige cuál es. -->
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

        @if (product(); as product) {
          <!-- Elegido del catálogo: la unidad viene con él y no se toca. -->
          <p class="flex items-center gap-2 rounded-sm bg-surface-sunken px-3 py-2.5
                    text-[13px] text-text-muted">
            <ui-icon name="info" [size]="16" />
            <span>Este hogar mide «{{ product.name }}» en {{ unitOf(product) }}.</span>
          </p>
        } @else if (isNew()) {
          <!-- No existe: se crea, y para eso hace falta saber en qué se mide. -->
          <div class="flex flex-col gap-2">
            <p class="text-[13px] text-text-muted">
              «{{ name().trim() }}» es nuevo en este hogar. Elige cómo lo mides: no se podrá
              cambiar después sin reinterpretar lo que vayas registrando.
            </p>
            <ui-select
              label="Unidad"
              name="unidad"
              [options]="units"
              [error]="unitError()"
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
          [hint]="quantityHint()"
          [error]="quantityError()"
          [ngModelOptions]="{ standalone: true }"
          [ngModel]="quantity()"
          (ngModelChange)="quantity.set($event)" />

        <div class="flex justify-end gap-2 pt-1">
          <ui-button variant="secondary" (pressed)="close()">Cancelar</ui-button>
          <ui-button type="submit" [loading]="saving()">Agregar</ui-button>
        </div>
      </form>
    </ng-template>

    @if (isDesktop()) {
      <ui-dialog [open]="open()" title="Agregar producto" (closed)="close()">
        <ng-container *ngTemplateOutlet="formulario" />
      </ui-dialog>
    } @else {
      <ui-bottom-sheet [open]="open()" title="Agregar producto" (closed)="close()">
        <ng-container *ngTemplateOutlet="formulario" />
      </ui-bottom-sheet>
    }
  `,
  styles: `
    :host { display: contents; }

    .sugerencia {
      display: flex;
      width: 100%;
      /* El relleno dejaba estos botones en 43px: un pixel por debajo del minimo. Un
         minimo escrito manda mas que un relleno que casualmente suma. */
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
    .sugerencia:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: -2px;
    }
  `,
})
export class AddItemPanel {
  private readonly catalog = inject(CatalogApi);
  private readonly pantry = inject(PantryApi);
  private readonly viewport = inject(ViewportService);

  readonly open = input(false);
  readonly householdId = input.required<string>();

  readonly closed = output<void>();
  /** Se agregó algo: quien escucha tiene que refrescar lo que enseña. */
  readonly added = output<string>();

  protected readonly isDesktop = this.viewport.isDesktop;
  protected readonly units = UNITS;

  protected readonly name = signal('');
  protected readonly unit = signal<string>('UNIT');
  protected readonly quantity = signal('');
  protected readonly chosen = signal<PantryProduct | null>(null);
  protected readonly suggestions = signal<readonly PantryProduct[]>([]);
  protected readonly saving = signal(false);

  /** El término cuyos resultados tenemos. `null` mientras no se ha buscado nada. */
  private readonly searched = signal<string | null>(null);

  /** El usuario dijo que quiere crearlo, teniendo sugerencias delante. */
  private readonly creating = signal(false);

  protected readonly nameError = signal('');
  protected readonly unitError = signal('');
  protected readonly quantityError = signal('');

  /** Lo que se busca en el catálogo. Vacío mientras haya un producto ya elegido. */
  private readonly term = computed(() => (this.chosen() ? '' : this.name().trim()));

  /**
   * El producto del catálogo al que se refiere lo escrito: el elegido a dedo, o el que se
   * llama exactamente así. Escribir el nombre entero de algo que el hogar ya conoce **es**
   * elegirlo; tratarlo como nuevo acabaría en un 409 por unidad que el usuario no provocó.
   */
  protected readonly product = computed<PantryProduct | null>(() => {
    const chosen = this.chosen();
    if (chosen) {
      return chosen;
    }
    const typed = this.name().trim().toLowerCase();
    return this.suggestions().find((p) => p.name.toLowerCase() === typed) ?? null;
  });

  /**
   * Hay que preguntar la unidad. Sólo cuando la búsqueda YA respondió para este texto: si no,
   * el bloque de «producto nuevo» parpadearía entre letra y letra, contradiciendo a la lista
   * de sugerencias que está justo encima.
   */
  protected readonly isNew = computed(() => {
    if (this.product() || this.name().trim().length === 0) {
      return false;
    }
    if (this.creating()) {
      return true;
    }
    // Sin nada que elegir no hace falta pedir permiso para crear: se pregunta la unidad y ya.
    return this.searched() === this.name().trim() && this.suggestions().length === 0;
  });

  protected readonly showSuggestions = computed(() =>
    this.suggestions().length > 0 && !this.product() && !this.creating());

  /**
   * «En unidades», no «En un.». La abreviatura es para ir pegada a una cifra, donde el
   * contexto la explica; suelta en una frase no es una palabra.
   */
  protected readonly quantityHint = computed(() => {
    const unit = this.product()?.unit ?? (this.unit() as ProductUnit);
    const name = UNITS.find((option) => option.value === unit)?.label ?? unitLabel(unit);
    return `En ${name.toLowerCase()}.`;
  });

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

    // Al abrirse, el formulario empieza limpio: lo que se escribió y no se envió la vez
    // anterior no tiene por qué reaparecer, y verlo relleno invita a agregarlo dos veces.
    effect(() => {
      if (this.open()) {
        this.reset();
      }
    });
  }

  protected unitOf(product: PantryProduct): string {
    return unitLabel(product.unit);
  }

  protected onNameChange(value: string): void {
    this.name.set(value);
    this.nameError.set('');
    // Seguir escribiendo deshace la decisión de crear: el nombre ya es otro.
    this.creating.set(false);
    // Cambiar el nombre después de elegir deshace la elección: ya no es ese producto.
    if (this.chosen() && value !== this.chosen()?.name) {
      this.chosen.set(null);
    }
  }

  protected startCreating(): void {
    this.creating.set(true);
  }

  protected choose(product: PantryProduct): void {
    this.chosen.set(product);
    this.name.set(product.name);
    this.unit.set(product.unit);
    this.suggestions.set([]);
    this.nameError.set('');
  }

  protected close(): void {
    this.closed.emit();
  }

  protected submit(): void {
    if (this.saving()) {
      return;
    }
    const name = this.name().trim();
    const quantity = Number.parseFloat(this.quantity().replace(',', '.'));

    this.nameError.set(name ? '' : 'Escribe qué quieres agregar.');
    this.quantityError.set(
      Number.isNaN(quantity) || quantity < 0 ? 'Escribe cuánto hay. Puede ser cero.' : '');
    if (this.nameError() || this.quantityError()) {
      return;
    }

    const product = this.product();
    this.saving.set(true);
    this.pantry
      .add(this.householdId(), product
        ? { productId: product.id, quantity }
        : { productName: name, unit: this.unit() as ProductUnit, quantity })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.added.emit(name);
          this.closed.emit();
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.showError(error);
        },
      });
  }

  /**
   * Los dos conflictos del alta se enseñan DONDE está la causa, no en un toast.
   *
   * Uno dice que el producto ya existe con otra unidad, y el otro que ya está en la
   * despensa; los dos traen del servidor la salida concreta, así que se pinta su texto en
   * vez de reescribirlo aquí y arriesgarse a que digan cosas distintas.
   */
  private showError(error: HttpErrorResponse): void {
    const detail = typeof error.error?.detail === 'string'
      ? error.error.detail
      : 'No se pudo agregar. Revisa la conexión y vuelve a intentarlo.';

    if (error.status === 409 && detail.includes('medido en')) {
      this.unitError.set(detail);
      return;
    }
    this.nameError.set(detail);
  }

  private reset(): void {
    this.name.set('');
    this.unit.set('UNIT');
    this.quantity.set('');
    this.chosen.set(null);
    this.creating.set(false);
    this.suggestions.set([]);
    this.searched.set(null);
    this.saving.set(false);
    this.nameError.set('');
    this.unitError.set('');
    this.quantityError.set('');
  }
}
