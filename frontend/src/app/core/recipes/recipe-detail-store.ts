import { Injectable, computed, inject, signal } from '@angular/core';

import { PantryStore } from '../pantry/pantry-store';
import type { ProductUnit } from '../pantry/pantry.models';
import { RecipeApi } from './recipe.api';
import type { RecipeAvailabilityReport, RecipeDetail } from './recipe.models';

/** Una línea que de verdad se puede descontar: tiene un artículo en la despensa. */
export interface DecrementLine {
  readonly pantryItemId: string;
  readonly productName: string;
  readonly unit: ProductUnit;
  readonly quantity: number;
}

/**
 * Una receta en su pantalla de detalle: la estructura —`GET /{id}`— y la disponibilidad
 * —`GET /{id}/availability`— cargadas a la vez, tal como el backend las separa (R8 en
 * docs/reglas-recetas.md). Las dos hacen falta aquí: la primera trae los pasos, la segunda
 * cuánto hay de cada ingrediente.
 *
 * <p>Inyecta el `PantryStore` raíz —no uno propio— para «Descontar ingredientes»: así la
 * escritura pasa por la misma cola optimista y agrupada que usa la despensa
 * (`PantryWrites`, D10 en reglas-despensa.md), y si el usuario visita la despensa después,
 * ve las cifras ya corregidas sin volver a pedir nada.
 */
@Injectable()
export class RecipeDetailStore {
  private readonly api = inject(RecipeApi);
  private readonly pantry = inject(PantryStore);

  private readonly householdId = signal<string | null>(null);
  private readonly recipeId = signal<string | null>(null);

  private readonly detail = signal<RecipeDetail | null>(null);
  private readonly availabilityReport = signal<RecipeAvailabilityReport | null>(null);
  private readonly loading = signal(false);
  private readonly failed = signal(false);

  readonly recipe = this.detail.asReadonly();
  readonly availability = this.availabilityReport.asReadonly();
  readonly isLoading = this.loading.asReadonly();
  readonly hasError = this.failed.asReadonly();

  readonly loaded = computed(() => this.detail() !== null && this.availabilityReport() !== null);

  /** Si la despensa raíz ya se cargó: mientras no, no se puede saber qué se puede descontar. */
  readonly pantryReady = this.pantry.loaded;

  /** Las líneas con artículo en la despensa. Lo que no está no se puede descontar. */
  readonly decrementable = computed<readonly DecrementLine[]>(() => {
    const report = this.availabilityReport();
    if (!report || !this.pantry.loaded()) {
      return [];
    }
    const porProducto = new Map(this.pantry.items().map((item) => [item.product.id, item]));
    return report.items.flatMap((item) => {
      const pantryItem = porProducto.get(item.productId);
      return pantryItem
        ? [{ pantryItemId: pantryItem.id, productName: item.productName, unit: item.unit, quantity: item.quantity }]
        : [];
    });
  });

  load(householdId: string, recipeId: string): void {
    this.householdId.set(householdId);
    this.recipeId.set(recipeId);
    this.loading.set(true);
    this.failed.set(false);
    this.detail.set(null);
    this.availabilityReport.set(null);

    this.api.get(householdId, recipeId).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.finishIfReady();
      },
      error: () => this.fail(),
    });
    this.api.availability(householdId, recipeId).subscribe({
      next: (report) => {
        this.availabilityReport.set(report);
        this.finishIfReady();
      },
      error: () => this.fail(),
    });
  }

  reload(): void {
    const householdId = this.householdId();
    const recipeId = this.recipeId();
    if (householdId && recipeId) {
      this.load(householdId, recipeId);
    }
  }

  /**
   * Descuenta cada línea que tiene artículo en la despensa. Una escritura relativa por
   * artículo, igual que un toque del stepper: componen con lo que haga cualquier otro
   * miembro a la vez, sin versión y sin conflicto posible (D2 en reglas-despensa.md).
   */
  decrementAll(): void {
    this.decrementable().forEach((line) => this.pantry.nudge(line.pantryItemId, -line.quantity));
  }

  private finishIfReady(): void {
    if (this.detail() !== null && this.availabilityReport() !== null) {
      this.loading.set(false);
    }
  }

  private fail(): void {
    this.failed.set(true);
    this.loading.set(false);
  }
}
