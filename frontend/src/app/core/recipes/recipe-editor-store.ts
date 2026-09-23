import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';

import { RecipeApi } from './recipe.api';
import type {
  CatalogProduct,
  RecipeDetail,
  RecipeIngredient,
  RecipeIngredientInput,
  RecipeInput,
} from './recipe.models';

/** Un ingrediente mientras se edita. Puede no existir todavía en el catálogo. */
export interface DraftIngredient {
  /** Identidad ESTABLE mientras dura la edición, exista o no en el servidor. */
  readonly key: string;
  /** Ausente si es un producto nuevo que se creará al guardar. */
  readonly productId?: string;
  readonly productName: string;
  readonly unit: CatalogProduct['unit'];
  readonly category?: string;
  readonly quantity: number;
  readonly optional: boolean;
}

/** La receta entera mientras se edita: un solo borrador, porque se guarda de un solo golpe. */
export interface RecipeDraft {
  readonly name: string;
  /** Cadena vacía = sin descripción. Se manda como ausente, no como texto vacío. */
  readonly description: string;
  readonly servings: number | null;
  readonly prepMinutes: number | null;
  readonly ingredients: readonly DraftIngredient[];
  readonly steps: readonly string[];
}

const EMPTY_DRAFT: RecipeDraft = {
  name: '',
  description: '',
  servings: null,
  prepMinutes: null,
  ingredients: [],
  steps: [],
};

/**
 * Una receta mientras se edita, en alta o en reemplazo.
 *
 * <p>El guardado es **explícito**: se edita en local y no sale nada hasta pulsar «Guardar».
 * El endpoint reemplaza la receta entera —nombre, descripción, raciones, minutos,
 * ingredientes y pasos, todo en un PUT—, así que un guardado automático mandaría el payload
 * completo por cada tecla, y dos miembros editando a la vez se pisarían con toda
 * naturalidad. Con un botón, el momento en que una versión gana es una decisión de alguien y
 * no del debounce.
 *
 * <p>Sirve para las dos rutas —crear y editar— con el mismo store: {@link startCreate} arma
 * un borrador vacío sin pedir nada al servidor; {@link load} trae uno existente. La única
 * diferencia en {@link save} es si hay un `recipeId` que reemplazar o no.
 */
@Injectable()
export class RecipeEditorStore {
  private readonly api = inject(RecipeApi);

  private readonly householdId = signal<string | null>(null);
  private readonly recipeId = signal<string | null>(null);

  /** Lo último que se sabe del servidor. `null` en alta: no hay nada contra qué comparar. */
  private readonly saved = signal<RecipeDetail | null>(null);

  /** Lo que el usuario tiene delante. */
  private readonly draft = signal<RecipeDraft>(EMPTY_DRAFT);

  private readonly loading = signal(false);
  private readonly saving = signal(false);
  private readonly failed = signal(false);
  private readonly saveError = signal('');

  readonly isNew = computed(() => this.recipeId() === null);
  readonly name = computed(() => this.draft().name);
  readonly description = computed(() => this.draft().description);
  readonly servings = computed(() => this.draft().servings);
  readonly prepMinutes = computed(() => this.draft().prepMinutes);
  readonly ingredients = computed(() => this.draft().ingredients);
  readonly steps = computed(() => this.draft().steps);

  /** La receta guardada, si la hay: de aquí sale el id para navegar tras crear. */
  readonly recipe = this.saved.asReadonly();
  readonly isLoading = this.loading.asReadonly();
  readonly isSaving = this.saving.asReadonly();
  readonly hasError = this.failed.asReadonly();
  readonly error = this.saveError.asReadonly();

  readonly loaded = computed(() => !this.isNew() && this.saved() !== null);

  /**
   * Si hay algo que guardar.
   *
   * <p>Se compara contenido, no referencias: añadir una línea y quitarla deja la receta como
   * estaba, y avisar de cambios pendientes que no existen enseña a ignorar el aviso. En alta,
   * se compara contra un borrador vacío: escribir un nombre ya es un cambio que se perdería.
   */
  readonly isDirty = computed(() => {
    const referencia = this.saved() ? RecipeEditorStore.toDraft(this.saved()!) : EMPTY_DRAFT;
    return this.signatureOf(referencia) !== this.signatureOf(this.draft());
  });

  startCreate(householdId: string): void {
    this.householdId.set(householdId);
    this.recipeId.set(null);
    this.saved.set(null);
    this.draft.set(EMPTY_DRAFT);
    this.loading.set(false);
    this.failed.set(false);
    this.saveError.set('');
  }

  load(householdId: string, recipeId: string): void {
    this.householdId.set(householdId);
    this.recipeId.set(recipeId);
    this.loading.set(true);
    this.failed.set(false);

    this.api.get(householdId, recipeId).subscribe({
      next: (detail) => {
        this.saved.set(detail);
        this.draft.set(RecipeEditorStore.toDraft(detail));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });
  }

  setName(name: string): void {
    this.updateDraft((draft) => ({ ...draft, name }));
  }

  setDescription(description: string): void {
    this.updateDraft((draft) => ({ ...draft, description }));
  }

  setServings(servings: number | null): void {
    this.updateDraft((draft) => ({ ...draft, servings }));
  }

  setPrepMinutes(prepMinutes: number | null): void {
    this.updateDraft((draft) => ({ ...draft, prepMinutes }));
  }

  /** Añade un ingrediente ya existente en el catálogo del hogar. */
  addExistingIngredient(product: CatalogProduct, quantity: number, optional: boolean): void {
    if (this.draft().ingredients.some((item) => item.productId === product.id)) {
      return;
    }
    this.updateDraft((draft) => ({
      ...draft,
      ingredients: [...draft.ingredients, {
        key: `existente-${product.id}`,
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        category: product.category,
        quantity,
        optional,
      }],
    }));
  }

  /** Añade un ingrediente por nombre: se creará en el catálogo al guardar, con esta unidad. */
  addNewIngredient(name: string, unit: CatalogProduct['unit'], quantity: number, optional: boolean): void {
    this.updateDraft((draft) => ({
      ...draft,
      ingredients: [...draft.ingredients, {
        key: `nuevo-${cryptoRandomKey()}`,
        productId: undefined,
        productName: name,
        unit,
        quantity,
        optional,
      }],
    }));
  }

  setIngredientQuantity(key: string, quantity: number): void {
    this.updateDraft((draft) => ({
      ...draft,
      ingredients: draft.ingredients.map((item) => (item.key === key ? { ...item, quantity } : item)),
    }));
  }

  setIngredientOptional(key: string, optional: boolean): void {
    this.updateDraft((draft) => ({
      ...draft,
      ingredients: draft.ingredients.map((item) => (item.key === key ? { ...item, optional } : item)),
    }));
  }

  /** Quita una línea y devuelve lo necesario para devolverla a su sitio. */
  removeIngredient(key: string): { item: DraftIngredient; index: number } | null {
    const index = this.draft().ingredients.findIndex((item) => item.key === key);
    if (index < 0) {
      return null;
    }
    const item = this.draft().ingredients[index];
    this.updateDraft((draft) => ({
      ...draft,
      ingredients: draft.ingredients.filter((candidate) => candidate.key !== key),
    }));
    return { item, index };
  }

  /** Deshacer: la línea vuelve DONDE estaba, no al final. */
  restoreIngredient(item: DraftIngredient, index: number): void {
    this.updateDraft((draft) => {
      const copia = [...draft.ingredients];
      copia.splice(Math.min(index, copia.length), 0, item);
      return { ...draft, ingredients: copia };
    });
  }

  addStep(instruction: string): void {
    const text = instruction.trim();
    if (!text) {
      return;
    }
    this.updateDraft((draft) => ({ ...draft, steps: [...draft.steps, text] }));
  }

  setStepText(index: number, instruction: string): void {
    this.updateDraft((draft) => ({
      ...draft,
      steps: draft.steps.map((step, i) => (i === index ? instruction : step)),
    }));
  }

  removeStep(index: number): void {
    this.updateDraft((draft) => ({ ...draft, steps: draft.steps.filter((_, i) => i !== index) }));
  }

  /**
   * Mueve un paso de una posición a otra. Un solo método para las dos vías de reordenar
   * —arrastrar y los botones subir/bajar— porque las dos acaban siendo el mismo cambio: un
   * elemento que cambia de índice. Los números de paso los pone el servidor al guardar
   * (R5 en reglas-recetas.md); aquí sólo importa el orden del array.
   */
  moveStep(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) {
      return;
    }
    this.updateDraft((draft) => {
      if (fromIndex < 0 || fromIndex >= draft.steps.length || toIndex < 0 || toIndex >= draft.steps.length) {
        return draft;
      }
      const steps = [...draft.steps];
      const [moved] = steps.splice(fromIndex, 1);
      steps.splice(toIndex, 0, moved);
      return { ...draft, steps };
    });
  }

  /**
   * @param onSaved se llama UNA vez, sólo si el guardado tuvo éxito. Existe para que la
   *   página pueda navegar tras crear —de `/recipes/new` a la receta ya con id—, sin
   *   inventar una espera por fuera de la suscripción real a la respuesta HTTP: reaccionar
   *   a una señal después de llamar a `save()` llegaría antes de que la respuesta exista,
   *   porque la petición es asíncrona y la señal no cambia hasta que vuelve.
   */
  save(onSaved?: (detail: RecipeDetail) => void): void {
    const householdId = this.householdId();
    if (!householdId || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set('');

    const input = RecipeEditorStore.toInput(this.draft());
    const recipeId = this.recipeId();
    const request = recipeId
      ? this.api.replace(householdId, recipeId, input)
      : this.api.create(householdId, input);

    request.subscribe({
      next: (detail) => {
        this.recipeId.set(detail.id);
        this.saved.set(detail);
        this.draft.set(RecipeEditorStore.toDraft(detail));
        this.saving.set(false);
        onSaved?.(detail);
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.saveError.set(typeof error.error?.detail === 'string'
          ? error.error.detail
          : 'No se pudo guardar. Revisa la conexión y vuelve a intentarlo.');
      },
    });
  }

  private updateDraft(change: (draft: RecipeDraft) => RecipeDraft): void {
    this.draft.update(change);
  }

  private static toDraft(detail: RecipeDetail): RecipeDraft {
    return {
      name: detail.name,
      description: detail.description ?? '',
      servings: detail.servings ?? null,
      prepMinutes: detail.prepMinutes ?? null,
      ingredients: detail.ingredients.map(RecipeEditorStore.toDraftIngredient),
      steps: detail.steps.slice().sort((a, b) => a.position - b.position).map((step) => step.instruction),
    };
  }

  private static toDraftIngredient(item: RecipeIngredient): DraftIngredient {
    return {
      key: item.id,
      productId: item.productId,
      productName: item.productName,
      unit: item.unit,
      category: item.category,
      quantity: item.quantity,
      optional: item.optional,
    };
  }

  private static toInput(draft: RecipeDraft): RecipeInput {
    return {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      servings: draft.servings ?? undefined,
      prepMinutes: draft.prepMinutes ?? undefined,
      ingredients: draft.ingredients.map(RecipeEditorStore.toIngredientInput),
      steps: draft.steps,
    };
  }

  private static toIngredientInput(item: DraftIngredient): RecipeIngredientInput {
    return item.productId
      ? { productId: item.productId, quantity: item.quantity, optional: item.optional }
      : { productName: item.productName, unit: item.unit, quantity: item.quantity, optional: item.optional };
  }

  /** Nombre, descripción, raciones, minutos, ingredientes y pasos, en orden. */
  private signatureOf(draft: RecipeDraft): string {
    const ingredientes = draft.ingredients
      .map((item) => `${item.productId ?? item.productName.toLowerCase()}:${item.unit}:${item.quantity}:${item.optional}`)
      .join(',');
    const pasos = draft.steps.join('|');
    return [draft.name, draft.description, draft.servings, draft.prepMinutes, ingredientes, pasos].join('\u0000');
  }
}

/** Sufijo aleatorio para claves de ingredientes nuevos. No necesita ser criptográfico. */
function cryptoRandomKey(): string {
  return Math.random().toString(36).slice(2);
}
