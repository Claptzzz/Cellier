import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { firstValueFrom, of, switchMap } from 'rxjs';

import { authInterceptor } from './core/auth/auth.interceptor';
import { errorInterceptor } from './core/auth/error.interceptor';
import { AuthService } from './core/auth/auth.service';
import { MyJoinRequestsService } from './core/household/my-join-requests.service';
import { routes } from './app.routes';

/**
 * Carga el perfil ANTES de que el router resuelva la primera URL.
 *
 * <p>No vale hacerlo en un guard: las redirecciones funcionales de las rutas antiguas y
 * la de la raíz se evalúan durante el reconocimiento de la URL, que ocurre **antes** de
 * que corra ningún `canActivate`. Sin el perfil cargado, `households` está vacío y esas
 * redirecciones mandan a la bienvenida a quien tiene hogares de sobra.
 *
 * <p>Cuando el usuario no tiene ningún hogar se traen también sus solicitudes, porque de
 * ellas depende el tercer estado de arranque: sin hogares pero esperando respuesta.
 *
 * <p>Cuesta una petición antes del primer pintado, y sólo para quien ya tiene sesión.
 */
function loadSessionBeforeRouting() {
  const auth = inject(AuthService);
  const myRequests = inject(MyJoinRequestsService);

  if (!auth.isAuthenticated()) {
    return;
  }

  return firstValueFrom(
    auth.ensureProfileLoaded().pipe(
      switchMap((profile) =>
        profile && profile.households.length === 0 ? myRequests.ensureLoaded() : of(null),
      ),
    ),
  );
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAppInitializer(loadSessionBeforeRouting),
    provideHttpClient(
      withFetch(),
      // El orden importa: authInterceptor va primero para que su reintento tras
      // refrescar el token vuelva a pasar por errorInterceptor sólo si falla de
      // verdad. Al revés, cada 401 recuperable dispararía un aviso al usuario.
      withInterceptors([authInterceptor, errorInterceptor]),
    ),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
  ],
};
