import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';

import { TemplateApi } from './template.api';
import type { CatalogProduct, TemplateDetail, TemplateItem } from './template.models';

/** Una línea mientras se edita. Puede no existir todavía en el servidor. */
export interface DraftItem {
  /** Identidad ESTABLE mientras dura la edición, exista o no en el servidor. */
  readonly key: string;
  readonly productId: string;
  readonly productName: string;
  readonly unit: CatalogProduct['unit'];
  readonly category?: string;
  readonly desiredQuantity: number;
}

/**
 * Una plantilla mientras se edita.
 *
 * <p>El guardado es **explícito**: se edita en local y no sale nada hasta pulsar «Guardar».
 * No es una preferencia estética. El endpoint reemplaza la lista entera, así que un guardado
 * automático mandaría la lista completa por cada tecla, y dos miembros editando a la vez se
 * pisarían con toda naturalidad. Con un botón, el momento en que una versión gana es una
 * decisión de alguien y no del debounce.
 *
 * <p>A cambio hay que sostener dos cosas que un guardado automático no necesita: saber si hay
 * cambios sin guardar, y avisar al salir. Las dos viven aquí.
 */
@Injectable()
export class TemplateEditorStore {
  private readonly api = inject(TemplateApi);

  private readonly householdId = signal<string | null>(null);
  private readonly templateId = signal<string | null>(null);

  /** Lo último que se sabe del servidor. Es contra esto que se compara para saber si hay cambios. */
  private readonly saved = signal<TemplateDetail | null>(null);

  /** Lo que el usuario tiene delante. */
  private readonly draft = signal<readonly DraftItem[]>([]);

  private readonly loading = signal(false);
  private readonly saving = signal(false);
  private readonly failed = signal(false);
  private readonly saveError = signal('');

  readonly items = this.draft.asReadonly();
  readonly template = this.saved.asReadonly();
  readonly isLoading = this.loading.asReadonly();
  readonly isSaving = this.saving.asReadonly();
  readonly hasError = this.failed.asReadonly();
  readonly error = this.saveError.asReadonly();

  readonly loaded = computed(() => this.saved() !== null);

  /**
   * Si hay algo que guardar.
   *
   * <p>Se compara contenido, no referencias: añadir una línea y quitarla deja la plantilla
   * como estaba, y avisar de cambios pendientes que no existen enseña a ignorar el aviso.
   */
  readonly isDirty = computed(() => {
    const saved = this.saved();
    if (!saved) {
      return false;
    }
    return this.signatureOf(saved.items) !== this.signatureOf(this.draft());
  });

  load(householdId: string, templateId: string): void {
    this.householdId.set(householdId);
    this.templateId.set(templateId);
    this.loading.set(true);
    this.failed.set(false);

    this.api.get(householdId, templateId).subscribe({
      next: (detail) => {
        this.saved.set(detail);
        this.draft.set(detail.items.map(TemplateEditorStore.toDraft));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });
  }

  add(product: CatalogProduct, desiredQuantity: number): void {
    if (this.draft().some((item) => item.productId === product.id)) {
      return;
    }
    this.draft.update((items) => [...items, {
      // Clave propia y no el identificador del producto: si más adelante el editor admitiera
      // dos líneas del mismo producto, la clave seguiría siendo única. Y sobrevive al
      // guardado, que es lo que impide que la lista parpadee al volver del servidor.
      key: `nueva-${product.id}`,
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      category: product.category,
      desiredQuantity,
    }]);
  }

  setQuantity(key: string, desiredQuantity: number): void {
    this.draft.update((items) => items.map((item) =>
      item.key === key ? { ...item, desiredQuantity } : item));
  }

  /** Quita una línea y devuelve lo necesario para devolverla a su sitio. */
  remove(key: string): { item: DraftItem; index: number } | null {
    const index = this.draft().findIndex((item) => item.key === key);
    if (index < 0) {
      return null;
    }
    const item = this.draft()[index];
    this.draft.update((items) => items.filter((candidate) => candidate.key !== key));
    return { item, index };
  }

  /** Deshacer: la línea vuelve DONDE estaba, no al final. */
  restore(item: DraftItem, index: number): void {
    this.draft.update((items) => {
      const copia = [...items];
      copia.splice(Math.min(index, copia.length), 0, item);
      return copia;
    });
  }

  save(): void {
    const householdId = this.householdId();
    const templateId = this.templateId();
    if (!householdId || !templateId || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set('');

    this.api
      .replaceItems(householdId, templateId, this.draft().map((item) => ({
        productId: item.productId,
        desiredQuantity: item.desiredQuantity,
      })))
      .subscribe({
        next: (detail) => {
          this.saved.set(detail);
          this.draft.set(detail.items.map(TemplateEditorStore.toDraft));
          this.saving.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.saveError.set(typeof error.error?.detail === 'string'
            ? error.error.detail
            : 'No se pudo guardar. Revisa la conexión y vuelve a intentarlo.');
        },
      });
  }

  private static toDraft(item: TemplateItem): DraftItem {
    return {
      key: item.id,
      productId: item.productId,
      productName: item.productName,
      unit: item.unit,
      category: item.category,
      desiredQuantity: item.desiredQuantity,
    };
  }

  /** Producto y cantidad, en orden. Dos listas iguales dan la misma firma. */
  private signatureOf(items: readonly { productId: string; desiredQuantity: number }[]): string {
    return items.map((item) => `${item.productId}:${item.desiredQuantity}`).join('|');
  }
}
