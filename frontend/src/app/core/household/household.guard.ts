import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, map } from 'rxjs';

import { ToastService } from '../toast/toast.service';
import { HouseholdContextService } from './household-context.service';
import { MyJoinRequestsService } from './my-join-requests.service';

/**
 * El mismo texto que devuelve el backend en su 404. Se repite palabra por palabra para
 * que la interfaz no invente una distinción que la API se niega a hacer.
 */
const NOT_AVAILABLE = 'No existe ese hogar, o ya no perteneces a él.';

/**
 * Protege todo lo que cuelga de `/h/:householdId/**`.
 *
 * <p>Resuelve tres situaciones, no dos:
 *
 * <ol>
 *   <li><b>Pertenece al hogar de la URL.</b> Pasa.</li>
 *   <li><b>No tiene ningún hogar.</b> A la bienvenida… salvo que tenga una solicitud
 *       pendiente, en cuyo caso va a la pantalla de espera. Enseñarle «crea tu primer
 *       hogar» a quien ya pidió entrar en uno y aguarda respuesta le dice que su
 *       solicitud se perdió.</li>
 *   <li><b>Tiene hogares, pero no ese.</b> Se le lleva a uno suyo, conservando la
 *       sección, y se le avisa con el texto del backend.</li>
 * </ol>
 *
 * <p><b>Un hogar ajeno y uno inexistente recorren exactamente el mismo camino.</b> No hay
 * dos mensajes ni dos destinos: si los hubiera, probar identificadores permitiría deducir
 * cuáles existen, que es justo lo que el 404 indistinguible del backend impide.
 *
 * <p>La URL siempre manda sobre el hogar recordado. Lo guardado sólo se consulta cuando
 * la URL no dice nada, y se valida contra la lista real antes de usarse.
 */
export const householdGuard: CanActivateFn = (route, state): Observable<boolean | UrlTree> | boolean | UrlTree => {
  const context = inject(HouseholdContextService);
  const myRequests = inject(MyJoinRequestsService);
  const toast = inject(ToastService);
  const router = inject(Router);

  const requested = route.paramMap.get('householdId');

  if (context.isMine(requested)) {
    return true;
  }

  if (!context.hasHouseholds()) {
    // Sin hogares: la respuesta depende de si ya hay algo en marcha.
    return myRequests
      .ensureLoaded()
      .pipe(map(() => router.createUrlTree([myRequests.hasPending() ? '/onboarding/pending' : '/onboarding'])));
  }

  // Tiene hogares, pero no este. Se conserva la sección para no dejarle en otro sitio
  // del que venía: quien abre un enlace a la despensa espera acabar en una despensa.
  toast.warn(NOT_AVAILABLE, 'Te llevamos a uno de tus hogares.');
  return router.createUrlTree(['/h', context.startupHouseholdId(), sectionOf(state.url)]);
};

/**
 * Protege `/h/:householdId/manage`, que sólo es para administradores.
 *
 * <p>Se aplica **después** de `householdGuard`, así que en este punto la membresía ya
 * está comprobada. Un miembro sin rol sí sabe que el hogar existe, de modo que aquí no
 * hay nada que ocultar y llevarle a la sección principal con un aviso es honesto.
 */
export const householdAdminGuard: CanActivateFn = (route): boolean | UrlTree => {
  const context = inject(HouseholdContextService);
  const toast = inject(ToastService);
  const router = inject(Router);

  const householdId = route.paramMap.get('householdId');

  // Por id y no por `context.isAdmin()`: durante un guard la señal derivada de la ruta
  // aún no se ha actualizado, porque eso ocurre en NavigationEnd.
  if (context.roleIn(householdId) === 'ADMIN') {
    return true;
  }

  toast.warn(
    'Esta sección es sólo para administradores',
    'Pídele a quien administra el hogar que te dé ese rol.',
  );
  return router.createUrlTree(['/h', householdId, 'home']);
};

/**
 * La última sección de una URL como `/h/<id>/pantry`. Si no se reconoce ninguna, cae en
 * la despensa, que es el destino por defecto de la aplicación.
 */
function sectionOf(url: string): string {
  const withoutQuery = url.split(/[?#]/, 1)[0];
  const segments = withoutQuery.split('/').filter(Boolean);
  // ['h', '<id>', '<sección>', …]
  return segments.length > 2 ? segments[2] : 'pantry';
}
