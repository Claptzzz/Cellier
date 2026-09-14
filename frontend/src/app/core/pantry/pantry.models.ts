/** Unidad canónica de un producto. No se convierte entre unidades: comparar es una resta. */
export type ProductUnit = 'UNIT' | 'G' | 'KG' | 'ML' | 'L' | 'PACK';

export type StorageLocation = 'PANTRY' | 'FRIDGE' | 'FREEZER' | 'OTHER';

/** Los tres órdenes que acepta el listado. El nombre es el que viaja en la URL. */
export type PantrySort = 'NAME' | 'QUANTITY' | 'EXPIRY';

export interface PantryProduct {
  readonly id: string;
  readonly name: string;
  readonly unit: ProductUnit;
  /** Ausente si el producto no está categorizado. La API omite los nulos. */
  readonly category?: string;
}

export interface PantryItem {
  readonly id: string;
  readonly product: PantryProduct;
  readonly quantity: number;
  readonly expiresAt?: string;
  /**
   * Cuánto se considera «tener suficiente», o `null` si el hogar no lo ha definido.
   *
   * Llega SIEMPRE, valiendo `null` cuando no hay objetivo, al revés que el resto de campos
   * nulos de la API, que se omiten. La diferencia importa: sin objetivo la banda de nivel
   * dibuja un estado binario —hay o no hay—, no una proporción del cero.
   */
  readonly parLevel: number | null;
  readonly storageLocation?: StorageLocation;
  /** Cambia con cada modificación. El PATCH de cantidad exacta la manda para no pisar a nadie. */
  readonly version: number;
}

/** Abreviatura que se pinta junto a la cantidad. */
const UNIT_LABELS: Record<ProductUnit, string> = {
  UNIT: 'un',
  G: 'g',
  KG: 'kg',
  ML: 'ml',
  L: 'L',
  PACK: 'pack',
};

export function unitLabel(unit: ProductUnit): string {
  return UNIT_LABELS[unit];
}

/**
 * Cuánto suma o resta un toque del stepper, según la unidad.
 *
 * Un salto de 1 sobre 1.500 g de arroz no es un control, es un castigo: harían falta cien
 * toques para lo que en la cabeza es «medio kilo más». El campo central sigue estando para
 * cualquier cifra que no caiga en el salto.
 */
export function stepFor(unit: ProductUnit): number {
  switch (unit) {
    case 'G':
    case 'ML':
      return 100;
    case 'KG':
    case 'L':
      return 0.5;
    default:
      return 1;
  }
}

/**
 * La cantidad, sin ceros de relleno.
 *
 * La API trabaja con tres decimales porque los necesita para no perder nada al sumar
 * movimientos, pero «12,000 un» en una estantería es ruido: quien mira quiere leer «12».
 */
export function formatQuantity(quantity: number): string {
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 }).format(quantity);
}
