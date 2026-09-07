import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, tap } from 'rxjs';

import { HouseholdApi } from './household.api';
import type { MyJoinRequest } from './household.models';

/**
 * Las solicitudes de ingreso que ha enviado el usuario.
 *
 * <p>Existe como servicio con estado, y no como una llamada suelta, porque hay un tercer
 * estado de arranque que el guard necesita conocer: <strong>sin hogares pero con una
 * solicitud pendiente</strong>. A esa persona no se le puede enseñar la pantalla de
 * bienvenida vacía como si nunca hubiera hecho nada; ya hizo lo único que podía hacer y
 * está esperando.
 *
 * <p>Se carga una sola vez y se conserva. Es información que cambia por decisión de otra
 * persona, no del usuario, así que refrescarla en cada navegación no ganaría nada:
 * quien quiera comprobar si ya lo aceptaron entra a su pantalla de solicitudes, que sí
 * recarga.
 */
@Injectable({ providedIn: 'root' })
export class MyJoinRequestsService {
  private readonly api = inject(HouseholdApi);

  /** `null` mientras no se haya cargado nunca. Distinto de «cargado y vacío». */
  private readonly items = signal<readonly MyJoinRequest[] | null>(null);

  readonly requests = computed<readonly MyJoinRequest[]>(() => this.items() ?? []);

  readonly pending = computed(() => this.requests().filter((request) => request.status === 'PENDING'));

  readonly hasPending = computed(() => this.pending().length > 0);

  readonly loaded = computed(() => this.items() !== null);

  /** Carga si aún no se ha cargado. Un fallo de red se traga: no debe bloquear una navegación. */
  ensureLoaded(): Observable<readonly MyJoinRequest[]> {
    const current = this.items();
    if (current !== null) {
      return of(current);
    }
    return this.reload();
  }

  reload(): Observable<readonly MyJoinRequest[]> {
    return this.api.myJoinRequests().pipe(
      tap((requests) => this.items.set(requests)),
      catchError(() => {
        this.items.set([]);
        return of<readonly MyJoinRequest[]>([]);
      }),
    );
  }

  /** Tras enviar o cancelar una solicitud, lo cacheado deja de ser cierto. */
  invalidate(): void {
    this.items.set(null);
  }
}
