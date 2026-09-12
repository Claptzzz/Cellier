import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { HouseholdContextService } from '../household/household-context.service';
import { PantryApi } from './pantry.api';
import type { PantryItem, PantrySort } from './pantry.models';

/** Un producto sin categorizar no aporta una opción de filtro. */
function isCategory(name: string | undefined): name is string {
  return !!name;
}

/** Lo que tarda el buscador en creerse que dejaste de escribir. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * La despensa del hogar activo, con sus filtros.
 *
 * <p>Guarda `null` mientras no se ha cargado nunca, que NO es lo mismo que una despensa
 * vacía: la pantalla que corresponde a cada caso es distinta —un skeleton frente a un
 * estado vacío diseñado— y enseñar «tu despensa está vacía» mientras los datos vienen en
 * camino es decirle a alguien que perdió sus cosas.
 *
 * <p>Filtrar y ordenar es cosa del servidor; agrupar lo que se acabó es cosa de aquí,
 * porque es una decisión de presentación y no cambia lo que se pidió.
 */
@Injectable({ providedIn: 'root' })
export class PantryStore {
  private readonly api = inject(PantryApi);
  private readonly context = inject(HouseholdContextService);

  // -- Filtros -------------------------------------------------------------

  /** Lo que hay escrito en el campo. Se pinta al instante; viaja con retraso. */
  readonly search = signal('');

  /** El texto que de verdad se ha pedido al servidor. */
  private readonly appliedSearch = signal('');

  readonly category = signal<string | null>(null);
  readonly sort = signal<PantrySort>('NAME');

  // -- Estado --------------------------------------------------------------

  /** `null` = todavía no lo sé. `[]` = cargado y no hay nada. */
  private readonly data = signal<readonly PantryItem[] | null>(null);
  private readonly failed = signal(false);
  private readonly busy = signal(false);
  private readonly reloadToken = signal(0);

  /**
   * Las categorías que se pueden elegir en el filtro.
   *
   * Se recuerdan de la última carga SIN filtros. Derivarlas de la respuesta actual haría
   * que la lista de opciones encogiera al filtrar —elegir «Nevera» dejaría «Nevera» como
   * única opción— y que un buscador con texto fuera borrando categorías mientras escribes.
   */
  private readonly knownCategories = signal<readonly string[]>([]);

  readonly items = computed<readonly PantryItem[]>(() => this.data() ?? []);

  readonly loaded = computed(() => this.data() !== null);

  readonly hasError = this.failed.asReadonly();

  /** Primera carga: no hay nada que enseñar todavía, van los skeletons. */
  readonly loadingFirstTime = computed(() => this.busy() && this.data() === null);

  /**
   * Recarga con datos ya en pantalla. La lista se queda puesta y sólo se marca ocupada:
   * cambiar a skeletons en cada tecla del buscador haría parpadear la pantalla entera.
   */
  readonly refreshing = computed(() => this.busy() && this.data() !== null);

  readonly categories = this.knownCategories.asReadonly();

  readonly hasFilters = computed(() => this.appliedSearch() !== '' || this.category() !== null);

  /** Lo que hay, en el orden que pidió el servidor. */
  readonly available = computed(() => this.items().filter((item) => item.quantity > 0));

  /**
   * Lo que se acabó, al final y en su propio grupo.
   *
   * No se ocultan: saber qué falta es justo la información que se va a buscar de pie en la
   * cocina antes de salir al súper.
   */
  readonly gone = computed(() => this.items().filter((item) => item.quantity <= 0));

  /** Cargado, sin filtros y sin nada: la despensa está vacía de verdad. */
  readonly isEmpty = computed(() => this.loaded() && this.items().length === 0 && !this.hasFilters());

  /** Cargado, con filtros, y ninguno encaja. Tiene salida propia: quitar los filtros. */
  readonly noMatches = computed(() => this.loaded() && this.items().length === 0 && this.hasFilters());

  constructor() {
    // El texto se pinta al teclear pero sólo viaja cuando paras: una petición por letra
    // sería la lista entera rehecha seis veces mientras escribes «lechuga».
    toObservable(this.search)
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((text) => this.appliedSearch.set(text.trim()));

    toObservable(this.request)
      .pipe(
        tap((request) => this.beforeLoad(request.householdId)),
        switchMap((request) => {
          if (!request.householdId) {
            return of(null);
          }
          return this.api
            .list(request.householdId, {
              search: request.search || undefined,
              category: request.category ?? undefined,
              sort: request.sort,
            })
            .pipe(
              tap((items) => this.afterLoad(items, request)),
              // Se traga aquí, y no en el suscriptor, para que un fallo no mate el flujo:
              // con el error propagado, el siguiente cambio de filtro ya no cargaría nada.
              catchError(() => {
                this.failed.set(true);
                this.busy.set(false);
                return of(null);
              }),
            );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  /** Tras un fallo, o cuando la pantalla quiere datos frescos. */
  reload(): void {
    this.reloadToken.update((token) => token + 1);
  }

  /** Deja la despensa como se abre por primera vez. La salida del estado «sin resultados». */
  clearFilters(): void {
    this.search.set('');
    this.appliedSearch.set('');
    this.category.set(null);
  }

  /** Todo lo que decide QUÉ se pide. Cambiar cualquiera de estas cosas dispara una carga. */
  private readonly request = computed(() => ({
    householdId: this.context.householdId(),
    search: this.appliedSearch(),
    category: this.category(),
    sort: this.sort(),
    token: this.reloadToken(),
  }));

  private lastHouseholdId: string | null = null;

  private beforeLoad(householdId: string | null): void {
    // Al cambiar de hogar, lo cargado deja de ser cierto y hay que volver a «no lo sé»:
    // conservarlo enseñaría la despensa del hogar del que se acaba de salir, con nombres
    // de productos que aquí no existen.
    if (householdId !== this.lastHouseholdId) {
      this.lastHouseholdId = householdId;
      this.data.set(null);
      this.knownCategories.set([]);
    }
    this.failed.set(false);
    this.busy.set(true);
  }

  private afterLoad(items: readonly PantryItem[], request: { search: string; category: string | null }): void {
    this.data.set(items);
    this.busy.set(false);

    if (request.search === '' && request.category === null) {
      this.knownCategories.set(
        [...new Set(items.map((item) => item.product.category).filter(isCategory))]
          .sort((a, b) => a.localeCompare(b, 'es')),
      );
    }
  }
}
