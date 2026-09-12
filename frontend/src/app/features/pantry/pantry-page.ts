import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { PantryStore } from '../../core/pantry/pantry-store';
import type { PantrySort } from '../../core/pantry/pantry.models';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { Skeleton } from '../../shared/ui/skeleton';
import type { SelectOption } from '../../shared/ui/select';
import { PantryRow } from './pantry-row';

const SORT_OPTIONS: readonly SelectOption[] = [
  { value: 'NAME', label: 'Nombre' },
  { value: 'QUANTITY', label: 'Queda menos' },
  { value: 'EXPIRY', label: 'Vence antes' },
];

/** Cuántas filas falsas se pintan mientras carga. Una pantalla de 375 muestra unas seis. */
const SKELETON_ROWS = 6;

/**
 * La despensa.
 *
 * <p>La pantalla más usada del producto, y se usa de pie: en la cocina antes de salir, o en
 * el pasillo del súper con el carro en la otra mano. De ahí que los filtros se queden
 * pegados arriba en vez de scrollear con la lista, y que las filas prefieran el aire a la
 * densidad.
 *
 * <p>Cuatro estados distintos comparten el mismo hueco y NO se pueden confundir: cargando
 * por primera vez, cargado y vacío, cargado con filtros que no encajan, y fallo. Enseñar
 * «tu despensa está vacía» mientras los datos vienen en camino es decirle a alguien que
 * perdió sus cosas.
 */
@Component({
  selector: 'app-pantry-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, EmptyState, FormsModule, Input, PantryRow, Select, Skeleton],
  template: `
    <!-- Sin gap entre la barra pegada y la lista: el hueco no lo tapa el fondo de la
         barra, y por él se ve pasar un trozo de tarjeta recortado mientras se scrollea.
         La separación la pone el padding INFERIOR de la barra, que sí es fondo. -->
    <div class="mx-auto flex w-full max-w-2xl flex-col pb-4">

      <!-- ============ FILTROS ============
           Pegados arriba: en una despensa larga, volver al buscador no debería costar un
           scroll entero con el carro en la otra mano.

           No se pintan cuando no hay nada que filtrar. Un buscador sobre una despensa
           vacía no es neutro: ocupa el sitio de lo único que esa pantalla tiene que
           decir, y sugiere que lo que falta podría estar escondido detrás de un filtro. -->
      @if (showFilters()) {
      <div class="sticky top-[var(--header-h)] z-30 flex flex-col gap-3 bg-surface pb-4 pt-2">
        <ui-input
          label="Buscar en la despensa"
          type="search"
          icon="magnifying-glass"
          placeholder="Huevos, salsa de tomate…"
          autocomplete="off"
          [ngModel]="store.search()"
          (ngModelChange)="store.search.set($event)" />

        <!-- Si en la despensa no hay ninguna categoría, el selector sólo podría ofrecer
             «Todas»: un control con una sola opción no es un filtro, es un adorno que
             ocupa la mitad del ancho que el orden sí aprovecha. -->
        <div class="grid gap-3" [class.grid-cols-2]="hasCategories()">
          @if (hasCategories()) {
            <ui-select
              label="Categoría"
              [options]="categoryOptions()"
              [ngModel]="store.category() ?? ''"
              (ngModelChange)="onCategoryChange($event)" />
          }

          <ui-select
            label="Ordenar por"
            [options]="sortOptions"
            [ngModel]="store.sort()"
            (ngModelChange)="onSortChange($event)" />
        </div>
      </div>
      }

      <!-- ============ CONTENIDO ============ -->
      @if (store.loadingFirstTime()) {
        <div class="flex flex-col gap-2" aria-busy="true">
          @for (row of skeletonRows; track row) {
            <div class="flex min-h-[68px] items-stretch gap-3 rounded-md border border-border
                        bg-surface-raised p-3">
              <ui-skeleton width="4px" height="100%" radius="999px" label="Cargando la despensa" />
              <div class="flex flex-1 items-center justify-between gap-3">
                <div class="flex w-full max-w-[60%] flex-col gap-2">
                  <ui-skeleton [width]="row.name" height="15px" />
                  <ui-skeleton [width]="row.detail" height="13px" />
                </div>
                <ui-skeleton width="44px" height="17px" />
              </div>
            </div>
          }
        </div>
      } @else if (store.hasError()) {
        <ui-empty-state
          icon="warning-circle"
          title="No pudimos cargar la despensa"
          description="Puede ser la conexión. Lo que hay guardado sigue a salvo.">
          <ui-button icon="arrows-clockwise" (pressed)="store.reload()">Reintentar</ui-button>
        </ui-empty-state>
      } @else if (store.isEmpty()) {
        <!-- Vacía de verdad: cargada, sin filtros y sin nada dentro. -->
        <ui-empty-state
          icon="package"
          title="Tu despensa está vacía"
          description="Aquí verás lo que hay en casa, con cuánto queda y qué está por vencer." />
      } @else if (store.noMatches()) {
        <ui-empty-state
          icon="magnifying-glass"
          title="Nada encaja con esa búsqueda"
          description="Puede que lo tengas guardado con otro nombre, o en otra categoría.">
          <ui-button variant="secondary" (pressed)="store.clearFilters()">Quitar filtros</ui-button>
        </ui-empty-state>
      } @else {
        <div class="flex flex-col gap-5" [attr.aria-busy]="store.refreshing() ? 'true' : null">

          @if (store.available().length > 0) {
            <ul class="flex list-none flex-col gap-2 p-0">
              @for (item of store.available(); track item.id) {
                <li><app-pantry-row [item]="item" [today]="today()" /></li>
              }
            </ul>
          }

          <!-- ============ SE ACABÓ ============
               No se ocultan. Saber qué falta es justamente lo que se viene a mirar antes
               de salir a comprar, así que van atenuados y al final, nunca fuera. -->
          @if (store.gone().length > 0) {
            <section class="flex flex-col gap-2" aria-labelledby="titulo-se-acabo">
              <div class="flex items-baseline gap-2">
                <h2 id="titulo-se-acabo" class="font-display text-[17px] font-semibold tracking-tight text-text">
                  Se acabó
                </h2>
                <span class="text-[13px] text-text-muted">{{ goneLabel() }}</span>
              </div>

              <ul class="flex list-none flex-col gap-2 p-0">
                @for (item of store.gone(); track item.id) {
                  <li><app-pantry-row [item]="item" [today]="today()" /></li>
                }
              </ul>
            </section>
          }
        </div>
      }
    </div>
  `,
  styles: `:host { display: block; }`,
})
export class PantryPage {
  protected readonly store = inject(PantryStore);

  constructor() {
    // El estado vive en un servicio de raíz que sobrevive a la navegación, así que al
    // volver a esta pantalla lo que hay pintado puede ser de hace media hora y de una
    // despensa que comparten cuatro personas. Se pide de nuevo, pero sólo si ya había
    // algo: en la primera visita el propio servicio acaba de cargarla, y reclamarla otra
    // vez serían dos peticiones idénticas seguidas.
    if (this.store.loaded()) {
      this.store.reload();
    }
  }

  protected readonly sortOptions = SORT_OPTIONS;

  /** Anchos distintos por fila: seis barras idénticas parecen una tabla, no una carga. */
  protected readonly skeletonRows = [
    { name: '58%', detail: '40%' },
    { name: '74%', detail: '52%' },
    { name: '46%', detail: '34%' },
    { name: '66%', detail: '46%' },
    { name: '52%', detail: '38%' },
    { name: '70%', detail: '30%' },
  ].slice(0, SKELETON_ROWS);

  /**
   * El día de hoy, leído una vez al abrir la pantalla.
   *
   * Se guarda en vez de llamar a `new Date()` dentro de cada fila para que todas comparen
   * contra el mismo día: en una lista larga, dos filas resueltas a los lados de la
   * medianoche dirían cosas distintas sobre la misma fecha.
   */
  protected readonly today = signal(new Date());

  /** Sin nada dentro, o sin haber podido cargarlo, no hay nada que buscar ni que ordenar. */
  protected readonly showFilters = computed(() => !this.store.isEmpty() && !this.store.hasError());

  protected readonly hasCategories = computed(() => this.store.categories().length > 0);

  protected readonly categoryOptions = computed<readonly SelectOption[]>(() => [
    // «Todas las categorías» se corta a 375: el campo ya se llama Categoría.
    { value: '', label: 'Todas' },
    ...this.store.categories().map((name) => ({ value: name, label: name })),
  ]);

  protected readonly goneLabel = computed(() => {
    const total = this.store.gone().length;
    return total === 1 ? '1 artículo' : `${total} artículos`;
  });

  protected onCategoryChange(value: string): void {
    this.store.category.set(value === '' ? null : value);
  }

  protected onSortChange(value: string): void {
    this.store.sort.set(value as PantrySort);
  }
}
