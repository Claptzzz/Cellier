import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, catchError, filter, switchMap, take, throwError } from 'rxjs';

import { AuthService } from './auth.service';

/**
 * Rutas que se autentican por sí mismas. Ponerles el Bearer sería, además de
 * inútil, un bucle: si /auth/refresh recibiera un 401 con Authorization puesto,
 * el interceptor intentaría refrescar para poder refrescar.
 */
const AUTH_FREE_PATHS = ['/api/v1/auth/', '/api/v1/health'];

/**
 * Estado del refresco, compartido por todas las peticiones en vuelo.
 *
 * `refreshing` evita que diez peticiones que fallan a la vez disparen diez
 * refrescos: el backend ROTA el refresh token en cada canje y revoca todas las
 * sesiones si detecta reutilización, así que dos refrescos simultáneos con el
 * mismo token cerrarían la sesión del usuario. Sólo el primero refresca; el
 * resto espera en `freshToken` y reintenta con el token nuevo.
 */
let refreshing = false;
const freshToken = new BehaviorSubject<string | null>(null);

function isAuthFree(url: string): boolean {
  return AUTH_FREE_PATHS.some((path) => url.includes(path));
}

function withBearer(request: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

export function authInterceptor(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (isAuthFree(request.url)) {
    return next(request);
  }

  const token = auth.accessToken();
  const authorized = token ? withBearer(request, token) : request;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      const is401 = error instanceof HttpErrorResponse && error.status === 401;
      if (!is401 || !auth.isAuthenticated()) {
        return throwError(() => error);
      }

      // Ya hay un refresco en curso: espera al token nuevo y reintenta.
      if (refreshing) {
        return freshToken.pipe(
          filter((value): value is string => value !== null),
          take(1),
          switchMap((value) => next(withBearer(request, value))),
        );
      }

      refreshing = true;
      freshToken.next(null);

      return auth.refresh().pipe(
        switchMap((response) => {
          refreshing = false;
          // Libera la cola: las peticiones encoladas reintentan con este token.
          freshToken.next(response.accessToken);
          return next(withBearer(request, response.accessToken));
        }),
        catchError((refreshError: unknown) => {
          // El refresco falló: la sesión no se puede salvar. Se limpia y se
          // manda a /login guardando a dónde quería ir.
          refreshing = false;
          freshToken.next(null);
          auth.clearSession();
          void router.navigate(['/login'], {
            queryParams: { redirect: router.url },
          });
          return throwError(() => refreshError);
        }),
      );
    }),
  );
}

/** Sólo para tests: reinicia el estado compartido entre casos. */
export function resetAuthInterceptorState(): void {
  refreshing = false;
  freshToken.next(null);
}
