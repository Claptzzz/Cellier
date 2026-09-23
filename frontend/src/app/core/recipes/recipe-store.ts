import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { HouseholdContextService } from '../household/household-context.service';
import { RecipeApi } from './recipe.api';
import type { RecipeAvailabilityFilter, RecipeSummary } from './recipe.models';

/** Lo que tarda el buscador en creerse que dejaste de escribir. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Las recetas del hogar activo, con sus filtros.
 *
 * <p>Guarda `null` mientras no se ha cargado nunca, que NO es lo mismo que un recetario
 * vacío: la pantalla que corresponde a cada caso es distinta —esqueletos frente a un estado
 * vacío diseñado— y enseñar «todavía no tienes recetas» mientras los datos vienen en camino
 * es contar una cosa por otra.
 *
 * <p>El filtro de disponibilidad y la búsqueda se resuelven en el servidor —nunca en
 * memoria—, y los dos viajan a la URL como query params: quien la comparte comparte también
 * lo que estaba viendo. Sincronizar la señal con la URL es cosa de la página, no de este
 * store: aquí sólo vive el estado y cómo se pide.
 */
@Injectable({ providedIn: 'root' })
export class RecipeStore {
  private readonly api = inject(RecipeApi);
  private readonly context = inject(HouseholdContextService);

  // -- Filtros -------------------------------------------------------------

  /** Lo que hay escrito en el campo. Se pinta al instante; viaja con retraso. */
  readonly search = signal('');

  /**
   * El texto que de verdad se ha pedido al servidor. Pública y de sólo lectura para que la
   * página pueda reflejarla en la URL sin reaccionar a cada tecla —eso ya lo hace `search`—
   * y sin que nadie de fuera pueda escribirla directamente sin pasar por el debounce.
   */
  private readonly appliedSearchState = signal('');
  readonly appliedSearch = this.appliedSearchState.asReadonly();

  /** El segmento activo del control ALL · READY · MISSING. Siempre visible, nunca oculto. */
  readonly availability = signal<RecipeAvailabilityFilter>('ALL');

  // -- Estado ----------------------------------------------------------------

  /** `null` = todavía no lo sé. `[]` = cargado y no hay ninguna. */
  private readonly data = signal<readonly RecipeSummary[] | null>(null);
  private readonly failed = signal(false);
  private readonly busy = signal(false);
  private readonly reloadToken = signal(0);

  readonly recipes = computed<readonly RecipeSummary[]>(() => this.data() ?? []);

  readonly loaded = computed(() => this.data() !== null);

  readonly hasError = this.failed.asReadonly();

  readonly loadingFirstTime = computed(() => this.busy() && this.data() === null);

  /** Recarga con datos ya en pantalla: la lista se queda puesta y sólo se marca ocupada. */
  readonly refreshing = computed(() => this.busy() && this.data() !== null);

  private readonly hasSearch = computed(() => this.appliedSearch() !== '');

  private readonly noResults = computed(() => this.loaded() && this.recipes().length === 0);

  /** Sin buscar nada y sin resultados: lo que corresponde a cada segmento distingue por qué. */
  private readonly noResultsWithoutSearch = computed(() => this.noResults() && !this.hasSearch());

  /** Buscando algo y sin resultados: un mensaje genérico, sea cual sea el segmento activo. */
  readonly noSearchMatches = computed(() => this.noResults() && this.hasSearch());

  /** `ALL`, sin buscar, sin ninguna receta: el recetario está vacío de verdad. */
  readonly isEmpty = computed(
    () => this.noResultsWithoutSearch() && this.availability() === 'ALL',
  );

  /** `READY`, sin buscar, sin ninguna lista: hay recetas, pero a ninguna le alcanza la despensa. */
  readonly noneReady = computed(
    () => this.noResultsWithoutSearch() && this.availability() === 'READY',
  );

  /** `MISSING`, sin buscar, sin ninguna con faltantes: todo lo que hay se puede cocinar. */
  readonly noneMissing = computed(
    () => this.noResultsWithoutSearch() && this.availability() === 'MISSING',
  );

  constructor() {
    // El texto se pinta al teclear pero sólo viaja cuando paras: una petición por letra
    // sería la lista entera rehecha varias veces mientras se escribe.
    toObservable(this.search)
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((text) => this.appliedSearchState.set(text.trim()));

    toObservable(this.request)
      .pipe(
        tap((request) => this.beforeLoad(request.householdId)),
        switchMap((request) => {
          if (!request.householdId) {
            return of(null);
          }
          return this.api
            .list(request.householdId, { availability: request.availability, search: request.search || undefined })
            .pipe(
              tap((recipes) => {
                this.data.set(recipes);
                this.busy.set(false);
              }),
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

  /** Tras crear, editar o borrar, lo cargado deja de ser cierto. */
  reload(): void {
    this.reloadToken.update((token) => token + 1);
  }

  /** Sólo quita la búsqueda: el segmento activo es una elección de navegación, no un filtro accesorio. */
  clearSearch(): void {
    this.search.set('');
    this.appliedSearchState.set('');
  }

  /**
   * Todo lo que decide QUÉ se pide.
   *
   * <p>Devuelve un objeto nuevo a propósito. Un `computed` que recalcula al mismo valor no
   * notifica a nadie —las señales comparan con `Object.is`—, así que devolver sólo el
   * identificador del hogar dejaría una recarga del mismo hogar sin efecto: el token
   * cambiaría, el resultado no, y el flujo se quedaría quieto.
   */
  private readonly request = computed(() => ({
    householdId: this.context.householdId(),
    availability: this.availability(),
    search: this.appliedSearch(),
    token: this.reloadToken(),
  }));

  private lastHouseholdId: string | null = null;

  private beforeLoad(householdId: string | null): void {
    // Al cambiar de hogar, lo cargado deja de ser cierto y hay que volver a «no lo sé»:
    // conservarlo enseñaría las recetas del hogar del que se acaba de salir.
    if (householdId !== this.lastHouseholdId) {
      this.lastHouseholdId = householdId;
      this.data.set(null);
    }
    this.failed.set(false);
    this.busy.set(true);
  }
}
