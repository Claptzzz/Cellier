/**
 * Cuándo un artículo está por vencer, y cómo se dice.
 *
 * Funciones puras, con el «hoy» recibido por parámetro: una fecha límite calculada contra
 * el reloj del sistema no se puede probar sin viajar en el tiempo, y el borde —vence hoy
 * contra venció ayer— es justamente lo que hay que probar.
 */

/** Los estados que la pantalla distingue. `none` es «tiene fecha y aún queda margen». */
export type ExpiryState = 'expired' | 'soon' | 'none';

/** A partir de aquí se avisa. Tres días es lo que cabe entre dos compras semanales. */
export const SOON_DAYS = 3;

/**
 * Días de calendario entre hoy y la fecha, en positivo hacia el futuro.
 *
 * Se compara por día y no por instante: a nadie le vence la leche «en 0,4 días». Y se hace
 * en UTC a propósito, porque restar dos fechas locales que cruzan un cambio de horario
 * devuelve 0,96 días y el redondeo se come un día entero.
 */
export function daysUntil(isoDate: string, today: Date): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - start) / 86_400_000);
}

export function expiryState(isoDate: string | undefined, today: Date): ExpiryState {
  if (!isoDate) {
    return 'none';
  }
  const days = daysUntil(isoDate, today);
  if (days < 0) {
    return 'expired';
  }
  return days <= SOON_DAYS ? 'soon' : 'none';
}

/**
 * El texto del aviso, o cadena vacía si no hay nada que avisar.
 *
 * El texto, no el color, es lo que distingue «vence pronto» de «vencido»: los dos tonos
 * tienen luminancias casi idénticas y en escala de grises no se separan.
 */
export function expiryLabel(isoDate: string | undefined, today: Date): string {
  if (!isoDate) {
    return '';
  }
  const days = daysUntil(isoDate, today);
  if (days < -1) {
    return `Venció hace ${-days} días`;
  }
  if (days === -1) {
    return 'Venció ayer';
  }
  if (days === 0) {
    return 'Vence hoy';
  }
  if (days === 1) {
    return 'Vence mañana';
  }
  return days <= SOON_DAYS ? `Vence en ${days} días` : '';
}

/**
 * La fecha, abreviada. «1 mar 2027», no «1 de marzo de 2027».
 *
 * La forma larga no cabe junto a la categoría en 375px y parte la fila en dos líneas, lo
 * que hace que un vencimiento lejano —el dato menos urgente de la fila— sea el que más
 * altura ocupa.
 */
export function formatExpiry(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(year, month - 1, day))
    .replace(/ de /g, ' ');
}
