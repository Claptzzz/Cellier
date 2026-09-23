import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { SKIP_ERROR_TOAST } from '../auth/error.interceptor';
import type {
  RecipeAvailabilityFilter,
  RecipeAvailabilityReport,
  RecipeDetail,
  RecipeInput,
  RecipeSummary,
} from './recipe.models';

/** Filtros del listado. Los vacíos no viajan: la API ya distingue ausente de vacío. */
export interface RecipeQuery {
  readonly availability?: RecipeAvailabilityFilter;
  readonly search?: string;
}

/**
 * Acceso HTTP a las recetas. Sólo transporta: no cachea, no decide y no mantiene estado.
 * El estado vive en `RecipeStore` / `RecipeEditorStore`.
 */
@Injectable({ providedIn: 'root' })
export class RecipeApi {
  private readonly http = inject(HttpClient);

  /** Los errores los pinta la pantalla, con su estado y su reintento. */
  private readonly handledByCaller = new HttpContext().set(SKIP_ERROR_TOAST, true);

  list(householdId: string, query: RecipeQuery = {}): Observable<readonly RecipeSummary[]> {
    let params = new HttpParams();
    if (query.availability && query.availability !== 'ALL') {
      params = params.set('availability', query.availability);
    }
    if (query.search) {
      params = params.set('search', query.search);
    }
    return this.http.get<readonly RecipeSummary[]>(
      this.base(householdId),
      { params, context: this.handledByCaller },
    );
  }

  /** La receta tal como se edita. No trae disponibilidad: ver {@link availability}. */
  get(householdId: string, recipeId: string): Observable<RecipeDetail> {
    return this.http.get<RecipeDetail>(
      `${this.base(householdId)}/${recipeId}`,
      { context: this.handledByCaller },
    );
  }

  /**
   * Si se puede cocinar ahora mismo, calculado al vuelo. No se cachea en ningún sitio: el
   * sentido de la pantalla es reflejar la despensa de este momento.
   */
  availability(householdId: string, recipeId: string): Observable<RecipeAvailabilityReport> {
    return this.http.get<RecipeAvailabilityReport>(
      `${this.base(householdId)}/${recipeId}/availability`,
      { context: this.handledByCaller },
    );
  }

  /** Receta, ingredientes y pasos en un solo payload. Se puede crear vacía. */
  create(householdId: string, input: RecipeInput): Observable<RecipeDetail> {
    return this.http.post<RecipeDetail>(
      this.base(householdId),
      input,
      { context: this.handledByCaller },
    );
  }

  /** Reemplazo completo: lo que no venga en el payload deja de estar en la receta. */
  replace(householdId: string, recipeId: string, input: RecipeInput): Observable<RecipeDetail> {
    return this.http.put<RecipeDetail>(
      `${this.base(householdId)}/${recipeId}`,
      input,
      { context: this.handledByCaller },
    );
  }

  remove(householdId: string, recipeId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.base(householdId)}/${recipeId}`,
      { context: this.handledByCaller },
    );
  }

  private base(householdId: string): string {
    return `/api/v1/households/${householdId}/recipes`;
  }
}
