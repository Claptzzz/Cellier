import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { SKIP_ERROR_TOAST } from '../auth/error.interceptor';
import type { Page, PantryItem, PantrySort, ProductUnit, StockMovement } from './pantry.models';

/** Lo que hace falta para dar de alta un artículo. O el producto, o su nombre y su unidad. */
export interface AddPantryItem {
  readonly productId?: string;
  readonly productName?: string;
  readonly unit?: ProductUnit;
  readonly quantity: number;
}

/** Filtros del listado. Los vacíos no viajan: la API ya distingue ausente de vacío. */
export interface PantryQuery {
  readonly search?: string;
  readonly category?: string;
  readonly sort?: PantrySort;
}

/**
 * Acceso HTTP a la despensa. Sólo transporta: no cachea, no decide y no mantiene estado.
 * El estado vive en `PantryStore`.
 */
@Injectable({ providedIn: 'root' })
export class PantryApi {
  private readonly http = inject(HttpClient);

  /**
   * El fallo del listado lo cuenta la pantalla, con su estado diseñado y su reintento.
   * Sin esto se cuenta dos veces: un toast genérico —«Algo salió mal»— encima de un
   * mensaje que ya dice qué pasó y qué hacer, y que además dice algo que el toast no
   * puede: que lo guardado sigue a salvo.
   */
  private readonly handledByCaller = new HttpContext().set(SKIP_ERROR_TOAST, true);

  /**
   * La despensa entera del hogar, filtrada y ordenada por el servidor.
   *
   * No se pagina: una despensa doméstica es corta y la lista necesita el conjunto para
   * agrupar al final lo que se acabó. El servidor la resuelve en una sola consulta.
   */
  list(householdId: string, query: PantryQuery = {}): Observable<readonly PantryItem[]> {
    let params = new HttpParams();
    if (query.search) {
      params = params.set('search', query.search);
    }
    if (query.category) {
      params = params.set('category', query.category);
    }
    if (query.sort) {
      params = params.set('sort', query.sort);
    }
    return this.http.get<readonly PantryItem[]>(
      this.base(householdId),
      { params, context: this.handledByCaller },
    );
  }

  /**
   * Gasta una cantidad. Relativo: compone con lo que haga otro miembro a la vez, en
   * cualquier orden, así que no lleva versión ni la necesita.
   *
   * Si se pide más de lo que hay, el servidor registra lo que de verdad se gastó.
   */
  consume(householdId: string, itemId: string, quantity: number): Observable<PantryItem> {
    return this.http.post<PantryItem>(
      `${this.base(householdId)}/${itemId}:consume`,
      { quantity },
      { context: this.handledByCaller },
    );
  }

  /** Repone una cantidad. Relativo, igual que `consume`. */
  restock(householdId: string, itemId: string, quantity: number): Observable<PantryItem> {
    return this.http.post<PantryItem>(
      `${this.base(householdId)}/${itemId}:restock`,
      { quantity },
      { context: this.handledByCaller },
    );
  }

  /**
   * Fija la cantidad contada a mano. ABSOLUTO: depende de lo que quien edita tenía delante,
   * así que manda la versión leída. Si ya no es la actual, el servidor responde 409 en vez
   * de borrar en silencio lo que otro miembro cambió entre medias.
   */
  setQuantity(
    householdId: string,
    itemId: string,
    quantity: number,
    version: number,
  ): Observable<PantryItem> {
    return this.http.patch<PantryItem>(
      `${this.base(householdId)}/${itemId}`,
      { quantity, version },
      { context: this.handledByCaller },
    );
  }

  /**
   * Mete un artículo en la despensa.
   *
   * Con `productId` usa un producto del catálogo. Con `productName` + `unit`, reutiliza el
   * que ya se llame así —sin distinguir mayúsculas— o lo crea. Si existe con OTRA unidad
   * responde 409: la unidad es parte de la identidad del producto, no un detalle suyo.
   */
  add(householdId: string, body: AddPantryItem): Observable<PantryItem> {
    return this.http.post<PantryItem>(
      this.base(householdId),
      body,
      { context: this.handledByCaller },
    );
  }

  /**
   * La bitácora de un artículo, de lo más reciente a lo más antiguo.
   *
   * Se pagina porque un artículo de uso diario acumula movimientos sin parar, y porque la
   * pantalla sólo necesita los últimos para responder «¿quién se llevó los huevos?».
   */
  movements(
    householdId: string,
    itemId: string,
    page: number,
    size: number,
  ): Observable<Page<StockMovement>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<Page<StockMovement>>(
      `${this.base(householdId)}/${itemId}/movements`,
      { params, context: this.handledByCaller },
    );
  }

  private base(householdId: string): string {
    return `/api/v1/households/${householdId}/pantry/items`;
  }
}
