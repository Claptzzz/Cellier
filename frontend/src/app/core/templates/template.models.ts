import type { PantryProduct, ProductUnit } from '../pantry/pantry.models';

/** Una plantilla en la lista: lo justo para elegir cuál abrir. */
export interface TemplateSummary {
  readonly id: string;
  readonly name: string;
  readonly itemCount: number;
  /** Ausente si quien la creó se dio de baja. La plantilla sigue siendo del hogar. */
  readonly createdByName?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Una línea de la plantilla: de este producto, tanta cantidad. */
export interface TemplateItem {
  readonly id: string;
  readonly productId: string;
  readonly productName: string;
  readonly unit: ProductUnit;
  readonly category?: string;
  readonly desiredQuantity: number;
}

/** Una plantilla con sus líneas. */
export interface TemplateDetail {
  readonly id: string;
  readonly name: string;
  readonly createdByName?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly items: readonly TemplateItem[];
}

/** Lo que se manda al reemplazar la lista entera. */
export interface TemplateItemInput {
  readonly productId: string;
  readonly desiredQuantity: number;
}

/** Un producto del catálogo, tal como lo usa el editor. Mismo tipo que en la despensa. */
export type CatalogProduct = PantryProduct;
