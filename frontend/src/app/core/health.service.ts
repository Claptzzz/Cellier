import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';

import type { HealthResponse, HealthState } from './health.models';

@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly http = inject(HttpClient);

  private readonly state = signal<HealthState>({ kind: 'loading' });

  /** Estado del último sondeo, de solo lectura para la vista. */
  readonly health = this.state.asReadonly();

  /** Lanza un sondeo contra `/api/v1/health` y actualiza el estado. */
  check(): void {
    this.state.set({ kind: 'loading' });

    this.http
      .get<HealthResponse>('/api/v1/health')
      .pipe(catchError((error: HttpErrorResponse) => of(error)))
      .subscribe((result) => {
        if (result instanceof HttpErrorResponse) {
          this.state.set({ kind: 'error', message: describe(result) });
          return;
        }
        this.state.set({ kind: 'ok', payload: result });
      });
  }
}

function describe(error: HttpErrorResponse): string {
  if (error.status === 0) {
    return 'No se pudo contactar al backend. ¿Está corriendo en http://localhost:8080?';
  }
  return `El backend respondió ${error.status} ${error.statusText}.`;
}
