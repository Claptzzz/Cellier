import { CanDeactivateFn } from '@angular/router';

/** Lo que tiene que saber hacer una pantalla para poder retener a quien se va. */
export interface ConfirmsLeaving {
  askToLeave(): Promise<boolean>;
}

/**
 * Retiene a quien sale con cambios sin guardar, y sólo entonces.
 *
 * <p>Es el complemento de `beforeunload`, que cubre cerrar la pestaña pero **no** una
 * navegación dentro de la aplicación: ahí no hay descarga de documento que el navegador
 * pueda interrumpir, así que el aviso tiene que ponerlo el router.
 *
 * <p>Sin cambios pendientes no pregunta nada. Un diálogo que aparece siempre es un diálogo
 * que se cierra sin leer, y el día que de verdad hay algo que perder tampoco se lee.
 */
export const unsavedChangesGuard: CanDeactivateFn<ConfirmsLeaving> = (component) =>
  component.askToLeave();
