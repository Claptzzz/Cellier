import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, map } from 'rxjs';

import { AuthService } from './auth.service';

/**
 * Protege las rutas de la app. Sin sesión, a /login recordando el destino.
 *
 * <p>Con sesión, **espera al perfil antes de dejar pasar**. No es un adorno: todo lo que
 * decide después sobre hogares —el guard de hogar, la redirección de la raíz, el
 * selector— lee `user().households`, y tras recargar la página el perfil aún no está
 * porque el access token vive sólo en memoria. Sin esta espera, el primer guard de hogar
 * vería una lista vacía y mandaría a la bienvenida a alguien que tiene hogares de sobra.
 */
export const authGuard: CanActivateFn = (_route, state): Observable<boolean | UrlTree> | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], {
      queryParams: state.url === '/' ? {} : { redirect: state.url },
    });
  }

  return auth.ensureProfileLoaded().pipe(
    map((profile) => {
      if (profile) {
        return true;
      }

      // Sin perfil hay dos motivos muy distintos y no se pueden tratar igual.
      //
      // Si la sesión sigue en pie, el problema es el servidor: no responde, o no se
      // pudo llegar a él. Mandar a /login sería mentir —la sesión es válida— y además
      // produce un bucle, porque guestGuard ve la sesión y devuelve a la raíz, que
      // vuelve a necesitar el perfil. La pantalla de reconexión rompe el ciclo y dice
      // la verdad, con un botón para volver a intentarlo.
      //
      // Si la sesión ya no está, el interceptor la limpió tras un refresco fallido:
      // eso sí es volver a entrar.
      if (auth.isAuthenticated()) {
        return router.createUrlTree(['/reconnect'], { queryParams: { redirect: state.url } });
      }
      return router.createUrlTree(['/login'], {
        queryParams: state.url === '/' ? {} : { redirect: state.url },
      });
    }),
  );
};

/** Evita que alguien ya autenticado vuelva a /login. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // A la raíz, no a una sección concreta: la raíz sabe resolver a qué hogar llevar, y
  // esta función no tiene por qué saberlo.
  return auth.isAuthenticated() ? router.createUrlTree(['/']) : true;
};
