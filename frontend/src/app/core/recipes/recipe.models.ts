import type { PantryProduct, ProductUnit } from '../pantry/pantry.models';

/** Si la receta se puede cocinar ahora mismo. */
export type RecipeAvailability = 'READY' | 'MISSING';

/** Cómo filtrar el listado. `ALL` no viaja como parámetro: es la ausencia de filtro. */
export type RecipeAvailabilityFilter = 'ALL' | 'READY' | 'MISSING';

/** Una receta en la lista: lo justo para pintar la tarjeta y el badge, sin llamadas extra. */
export interface RecipeSummary {
  readonly id: string;
  readonly name: string;
  readonly ingredientCount: number;
  readonly missingCount: number;
  readonly availability: RecipeAvailability;
  /** Ausente si quien la creó se dio de baja. La receta sigue siendo del hogar. */
  readonly createdByName?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Un ingrediente, tal como se edita: sin cruzar contra la despensa. */
export interface RecipeIngredient {
  readonly id: string;
  readonly productId: string;
  readonly productName: string;
  readonly unit: ProductUnit;
  readonly category?: string;
  readonly quantity: number;
  readonly optional: boolean;
}

/** Un paso, en su posición. Sólo el servidor decide la posición: se renumera al guardar. */
export interface RecipeStep {
  readonly position: number;
  readonly instruction: string;
}

/**
 * La receta tal como se edita: nombre, descripción, raciones, minutos, ingredientes y pasos.
 * No trae disponibilidad — eso vive en {@link RecipeAvailabilityReport}, detrás de su propio
 * endpoint, igual que en el backend (docs/reglas-recetas.md R8).
 */
export interface RecipeDetail {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly servings?: number;
  readonly prepMinutes?: number;
  readonly createdByName?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly ingredients: readonly RecipeIngredient[];
  readonly steps: readonly RecipeStep[];
}

/** Un ingrediente cruzado contra la despensa: cuánto pide, cuánto hay, cuánto falta. */
export interface RecipeIngredientAvailability {
  readonly productId: string;
  readonly productName: string;
  readonly unit: ProductUnit;
  readonly category?: string;
  readonly quantity: number;
  readonly availableQuantity: number;
  readonly missingQuantity: number;
  readonly optional: boolean;
  readonly sufficient: boolean;
}

/**
 * Si una receta se puede cocinar ahora mismo, y por qué. Se calcula al pedirla y no se
 * guarda en ningún sitio: es cierta en el instante que declara `generatedAt`.
 */
export interface RecipeAvailabilityReport {
  readonly recipeId: string;
  readonly recipeName: string;
  readonly generatedAt: string;
  readonly availability: RecipeAvailability;
  readonly missingCount: number;
  readonly items: readonly RecipeIngredientAvailability[];
}

/** Un ingrediente, tal como se manda al crear o reemplazar la receta entera. */
export interface RecipeIngredientInput {
  readonly productId?: string;
  readonly productName?: string;
  readonly unit?: ProductUnit;
  readonly quantity: number;
  readonly optional: boolean;
}

/** El payload completo de creación o reemplazo: receta, ingredientes y pasos juntos. */
export interface RecipeInput {
  readonly name: string;
  readonly description?: string;
  readonly servings?: number;
  readonly prepMinutes?: number;
  readonly ingredients: readonly RecipeIngredientInput[];
  readonly steps: readonly string[];
}

/** Un producto del catálogo, tal como lo usa el editor. Mismo tipo que en la despensa. */
export type CatalogProduct = PantryProduct;
