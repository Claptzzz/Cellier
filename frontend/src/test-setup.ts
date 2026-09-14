/**
 * Arranque de los tests.
 *
 * El entorno de pruebas no implementa el `<dialog>` modal: `showModal()` y `close()` no
 * existen, así que cualquier componente que los use revienta al montarse. No es un hueco del
 * producto —en un navegador de verdad funcionan— sino del DOM simulado, y sin este relleno
 * el diálogo y la hoja inferior quedarían fuera del alcance de los tests para siempre.
 */
const proto = HTMLDialogElement?.prototype as HTMLDialogElement | undefined;

if (proto && typeof proto.showModal !== 'function') {
  proto.showModal = function showModal(this: HTMLDialogElement): void {
    this.open = true;
  };
  proto.show = function show(this: HTMLDialogElement): void {
    this.open = true;
  };
  proto.close = function close(this: HTMLDialogElement, returnValue?: string): void {
    this.open = false;
    if (returnValue !== undefined) {
      this.returnValue = returnValue;
    }
    this.dispatchEvent(new Event('close'));
  };
}
