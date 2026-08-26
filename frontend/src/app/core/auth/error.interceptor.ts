import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { ToastService } from '../toast/toast.service';
import type { ProblemDetail } from './auth.models';

/**
 * Mensajes por código de estado. El `detail` del ProblemDetail ya viene en
 * español desde el backend, así que se prefiere cuando existe; esto es el
 * respaldo para errores de red o respuestas sin cuerpo.
 */
const FALLBACK: Record<number, string> = {
  0: 'No se pudo contactar al servidor. Revisa tu conexión.',
  400: 'Revisa los datos enviados.',
  401: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  403: 'No tienes permiso para hacer esto.',
  404: 'No encontramos lo que buscabas.',
  409: 'Ese cambio choca con el estado actual.',
  422: 'Revisa los datos enviados.',
  429: 'Demasiadas peticiones. Espera un momento.',
  500: 'Error del servidor. Inténtalo de nuevo más tarde.',
  503: 'El servicio no está disponible. Inténtalo más tarde.',
};

function isProblemDetail(body: unknown): body is ProblemDetail {
  return typeof body === 'object' && body !== null && ('title' in body || 'detail' in body);
}

/** Convierte el mapa `errors` de validación en una línea legible. */
function describeFieldErrors(problem: ProblemDetail): string | undefined {
  if (!problem.errors) {
    return undefined;
  }
  const messages = Object.values(problem.errors);
  return messages.length ? messages.join('. ') : undefined;
}

export function errorInterceptor(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  const toast = inject(ToastService);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }

      // El 401 lo gestiona authInterceptor: puede recuperarse con un refresco y
      // avisar aquí produciría un toast por cada renovación silenciosa.
      if (error.status === 401) {
        return throwError(() => error);
      }

      const problem = isProblemDetail(error.error) ? error.error : null;
      const title = problem?.title ?? 'Algo salió mal';
      const detail =
        describeFieldErrors(problem ?? {}) ??
        problem?.detail ??
        FALLBACK[error.status] ??
        'Ocurrió un error inesperado.';

      toast.error(title, detail);
      return throwError(() => error);
    }),
  );
}
