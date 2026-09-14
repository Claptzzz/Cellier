import { ElementRef, Signal, effect } from '@angular/core';

/** Los elementos nativos que llevan un `value` que el usuario puede cambiar. */
type NativeField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/**
 * Mantiene el elemento nativo enseñando lo que dice la señal.
 *
 * <p><strong>Por qué no basta `[value]="algo()"`.</strong> Una interpolación de propiedad sólo
 * escribe el DOM cuando el valor enlazado cambia <em>entre dos comprobaciones</em>. Si el
 * usuario teclea, el elemento ya tiene su texto y Angular anota ese mismo valor como el
 * último visto; cuando algo de fuera devuelve la señal a lo que ya había —vaciar un
 * formulario tras enviarlo, corregir una fila tras un conflicto— no hay cambio que detectar
 * y el DOM se queda con lo que el usuario escribió. El control enseña una cifra que ya nadie
 * sostiene.
 *
 * <p>Un efecto depende de la señal, no de lo que Angular recuerde, así que reacciona siempre.
 * Y como también lee la referencia al elemento, vuelve a correr en cuanto la vista existe:
 * eso arregla de paso el valor inicial, que llegaba antes de que hubiera elemento donde
 * ponerlo.
 *
 * <p>Se escribe **sólo si difiere**: asignar el mismo texto mueve el cursor en algunos
 * navegadores, y hacerlo en cada pulsación sería teclear con el carrete saltando al final.
 *
 * <p>Con esto, quien use este ayudante NO debe enlazar además `[value]`: dos mecanismos
 * escribiendo el mismo atributo se pisan, y el error resultante sólo aparece en el orden
 * concreto en que corran.
 *
 * <p>El mismo fallo apareció por separado en `ui-input` y en `ui-quantity-stepper`, con dos
 * incrementos de diferencia, y estaba también en `ui-select` sin que nadie lo hubiera mirado.
 * Tres veces la misma causa es una pieza, no tres arreglos.
 */
export function mirrorToNative(
  field: Signal<ElementRef<NativeField> | undefined>,
  value: Signal<string>,
): void {
  effect(() => {
    const element = field()?.nativeElement;
    const next = value();
    if (element && element.value !== next) {
      element.value = next;
    }
  });
}
