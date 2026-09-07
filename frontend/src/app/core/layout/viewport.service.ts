import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** A partir de aquí hay barra lateral, y los paneles se anclan en vez de subir. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * Si la pantalla es de escritorio, como señal.
 *
 * <p>No es una preferencia estética: decide qué contenedor se **monta**. Una hoja inferior
 * y un panel anclado son los dos `<dialog>`, así que renderizar los dos y ocultar uno por
 * CSS dejaría dos capas modales apiladas al abrir. Se monta uno solo, y esta señal dice
 * cuál.
 */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly desktop = signal(
    typeof matchMedia === 'function' ? matchMedia(DESKTOP_QUERY).matches : true,
  );

  readonly isDesktop = this.desktop.asReadonly();

  /** Se emite al cruzar el umbral, para que quien tenga un panel abierto lo cierre. */
  private readonly changes = signal(0);
  readonly breakpointChanged = this.changes.asReadonly();

  constructor() {
    if (typeof matchMedia !== 'function') {
      return;
    }
    const query = matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      this.desktop.set(event.matches);
      this.changes.update((n) => n + 1);
    };
    query.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
  }
}
