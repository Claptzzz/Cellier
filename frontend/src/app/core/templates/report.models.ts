import type { ProductUnit } from '../pantry/pantry.models';

/** Si la línea ya está cubierta por la despensa o hay que comprar. */
export type ReportItemStatus = 'COMPLETE' | 'MISSING';

export interface ReportItem {
  readonly productId: string;
  readonly productName: string;
  readonly unit: ProductUnit;
  readonly category?: string;
  readonly desiredQuantity: number;
  readonly availableQuantity: number;
  readonly missingQuantity: number;
  readonly status: ReportItemStatus;
}

export interface ReportSummary {
  readonly totalItems: number;
  readonly missingItems: number;
  /** Proporción de LÍNEAS cubiertas. No es un nivel de existencias. */
  readonly completionRate: number;
}

export interface TemplateReport {
  readonly templateId: string;
  readonly templateName: string;
  readonly generatedAt: string;
  readonly summary: ReportSummary;
  readonly items: readonly ReportItem[];
}

/** Un grupo de categoría, formado a partir de la lista YA ordenada por el servidor. */
export interface ReportGroup {
  readonly category: string;
  readonly items: readonly ReportItem[];
}

/**
 * Agrupa por categoría recorriendo la lista en el orden en que llegó.
 *
 * <p>No ordena ni reordena: el servidor ya devolvió faltantes primero, por categoría y por
 * nombre. Esto sólo corta la lista donde cambia la categoría, que es pintar encabezados.
 * Si el servidor devolviera grupos anidados, la respuesta cambiaría de forma para ahorrarle
 * al cliente un bucle.
 */
export function groupByCategory(items: readonly ReportItem[]): readonly ReportGroup[] {
  const grupos: ReportGroup[] = [];
  for (const item of items) {
    const category = item.category ?? 'Sin categoría';
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.category === category) {
      (ultimo.items as ReportItem[]).push(item);
    } else {
      grupos.push({ category, items: [item] });
    }
  }
  return grupos;
}
