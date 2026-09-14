import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { SKIP_ERROR_TOAST } from '../auth/error.interceptor';
import type { PantryProduct } from './pantry.models';

/**
 * El catálogo de productos del hogar: lo que este hogar ya sabe medir.
 *
 * <p>Existe separado de `PantryApi` porque son cosas distintas: el catálogo dice qué
 * productos conoce el hogar y en qué unidad, la despensa dice cuánto hay de cada uno. Un
 * producto puede estar en el catálogo sin estar en la despensa.
 */
@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private readonly http = inject(HttpClient);

  /** El formulario enseña sus propios errores; un toast encima sólo taparía el campo. */
  private readonly handledByCaller = new HttpContext().set(SKIP_ERROR_TOAST, true);

  /** Productos del hogar cuyo nombre contiene el texto. Sin texto, devuelve todos. */
  search(householdId: string, search: string): Observable<readonly PantryProduct[]> {
    const params = search ? new HttpParams().set('search', search) : undefined;
    return this.http.get<readonly PantryProduct[]>(
      `/api/v1/households/${householdId}/products`,
      { params, context: this.handledByCaller },
    );
  }
}
