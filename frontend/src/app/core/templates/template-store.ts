import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { of, switchMap, tap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { HouseholdContextService } from '../household/household-context.service';
import { TemplateApi } from './template.api';
import type { TemplateSummary } from './template.models';

/**
 * Las plantillas del hogar activo.
 *
 * <p>Guarda `null` mientras no se ha cargado nunca, que NO es lo mismo que un hogar sin
 * plantillas: la pantalla que corresponde a cada caso es distinta —esqueletos frente a un
 * estado vacío que explica para qué sirven— y enseñar «todavía no tienes ninguna» mientras
 * los datos vienen en camino es contar una cosa por otra.
 */
@Injectable({ providedIn: 'root' })
export class TemplateStore {
  private readonly api = inject(TemplateApi);
  private readonly context = inject(HouseholdContextService);

  /** `null` = todavía no lo sé. `[]` = cargado y no hay ninguna. */
  private readonly data = signal<readonly TemplateSummary[] | null>(null);
  private readonly failed = signal(false);
  private readonly busy = signal(false);
  private readonly reloadToken = signal(0);

  readonly templates = computed<readonly TemplateSummary[]>(() => this.data() ?? []);

  readonly loaded = computed(() => this.data() !== null);

  readonly hasError = this.failed.asReadonly();

  readonly loadingFirstTime = computed(() => this.busy() && this.data() === null);

  readonly isEmpty = computed(() => this.loaded() && this.templates().length === 0);

  constructor() {
    toObservable(this.request)
      .pipe(
        tap(({ householdId }) => this.beforeLoad(householdId)),
        switchMap(({ householdId }) => {
          if (!householdId) {
            return of(null);
          }
          return this.api.list(householdId).pipe(
            tap((templates) => {
              this.data.set(templates);
              this.busy.set(false);
            }),
            // Se traga aquí y no en el suscriptor: con el error propagado, el flujo quedaría
            // cerrado y ni cambiar de hogar ni reintentar volverían a pedir nada.
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

  /** Tras crear, duplicar, renombrar o borrar, lo cargado deja de ser cierto. */
  reload(): void {
    this.reloadToken.update((token) => token + 1);
  }

  /**
   * Todo lo que decide QUÉ se pide.
   *
   * <p>Devuelve un objeto nuevo a propósito. Un `computed` que recalcula al mismo valor no
   * notifica a nadie —las señales comparan con `Object.is`—, así que devolviendo el
   * identificador del hogar a secas, recargar el mismo hogar no disparaba nada: el token
   * cambiaba, el resultado no, y el flujo se quedaba quieto.
   */
  private readonly request = computed(() => ({
    householdId: this.context.householdId(),
    token: this.reloadToken(),
  }));

  private lastHouseholdId: string | null = null;

  private beforeLoad(householdId: string | null): void {
    // Al cambiar de hogar, lo cargado deja de ser cierto y hay que volver a «no lo sé»:
    // conservarlo enseñaría las plantillas del hogar del que se acaba de salir.
    if (householdId !== this.lastHouseholdId) {
      this.lastHouseholdId = householdId;
      this.data.set(null);
    }
    this.failed.set(false);
    this.busy.set(true);
  }
}
