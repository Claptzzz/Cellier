import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, concatMap, of, tap } from 'rxjs';

import { ToastService } from '../toast/toast.service';
import { PantryApi } from './pantry.api';
import { formatQuantity, unitLabel } from './pantry.models';
import type { PantryItem } from './pantry.models';

/** Cuánto se espera a que dejes de tocar antes de mandar nada. */
export const WRITE_DEBOUNCE_MS = 600;

/** Lo que el llamante tiene que saber hacer para que esto pueda pintar por adelantado. */
export interface WriteHost {
  readonly find: (itemId: string) => PantryItem | undefined;
  /** Cambia lo pintado sin esperar al servidor. */
  readonly patch: (itemId: string, changes: Partial<PantryItem>) => void;
  /** Cuando no queda más remedio que volver a preguntarlo todo. */
  readonly reload: () => void;
}

interface Pending {
  /** Toques acumulados que todavía no han salido. */
  delta: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Las escrituras de la despensa: optimistas, agrupadas y en fila de a uno por artículo.
 *
 * <p><strong>Optimistas</strong> porque el gesto es el de una estantería: tocas −1 y la
 * cifra baja. Esperar a la red para mover un número convierte un gesto físico en un trámite.
 *
 * <p><strong>Agrupadas</strong> porque seis toques seguidos son una sola intención. Se
 * acumulan durante {@link WRITE_DEBOUNCE_MS} y sale una llamada con el neto. Si el neto es
 * cero —tocaste +1 y luego −1— no se manda nada: no pasó nada que contar, y escribir un
 * movimiento de cero ensuciaría la bitácora que explica la cantidad.
 *
 * <p><strong>En fila</strong> porque las dos clases de escritura no se pueden pisar. Un
 * toque es relativo y compone con cualquiera; un número tecleado es absoluto y viaja con la
 * versión que había al mandarlo. Si salieran a la vez, el absoluto usaría una versión que el
 * relativo está a punto de invalidar, y el usuario recibiría un conflicto contra sí mismo.
 */
@Injectable({ providedIn: 'root' })
export class PantryWrites {
  private readonly api = inject(PantryApi);
  private readonly toasts = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly pending = new Map<string, Pending>();
  private readonly channels = new Map<string, Subject<() => Observable<unknown>>>();

  private host: WriteHost | null = null;
  private householdId: string | null = null;

  connect(host: WriteHost): void {
    this.host = host;
  }

  useHousehold(householdId: string | null): void {
    if (householdId !== this.householdId) {
      this.forget();
      this.householdId = householdId;
    }
  }

  /** Un toque en − o en +. */
  nudge(itemId: string, delta: number): void {
    const item = this.host?.find(itemId);
    if (!item || delta === 0) {
      return;
    }
    this.host?.patch(itemId, { quantity: round(item.quantity + delta) });

    const pending = this.pendingFor(itemId);
    pending.delta = round(pending.delta + delta);
    this.restartTimer(itemId, pending);
  }

  /** Una cantidad escrita a mano. Reemplaza lo que hubiera sin mandar, porque lo contradice. */
  setQuantity(itemId: string, quantity: number): void {
    const item = this.host?.find(itemId);
    if (!item) {
      return;
    }
    const applied = round(quantity - item.quantity);
    this.dropPending(itemId);
    this.host?.patch(itemId, { quantity });

    if (applied === 0) {
      return;
    }
    this.send(itemId, applied, (id, householdId) => {
      // La versión se lee AQUÍ, al salir, y no al abrir el campo: para entonces los toques
      // del propio usuario ya han pasado por esta misma fila y la han hecho avanzar. Mandar
      // la de antes daría un conflicto contra uno mismo.
      const actual = this.host?.find(id);
      return this.api.setQuantity(householdId, id, quantity, actual?.version ?? item.version);
    });
  }

  /** Manda ya lo que estuviera esperando. Para cuando la pantalla se va. */
  flush(itemId?: string): void {
    const ids = itemId ? [itemId] : [...this.pending.keys()];
    ids.forEach((id) => {
      const pending = this.pending.get(id);
      if (pending?.timer) {
        clearTimeout(pending.timer);
        pending.timer = null;
        this.sendPending(id);
      }
    });
  }

  /** Al cambiar de hogar, lo que no salió ya no tiene a qué artículo referirse. */
  forget(): void {
    this.pending.forEach((pending) => {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
    });
    this.pending.clear();
  }

  // ------------------------------------------------------------------------

  private pendingFor(itemId: string): Pending {
    let pending = this.pending.get(itemId);
    if (!pending) {
      pending = { delta: 0, timer: null };
      this.pending.set(itemId, pending);
    }
    return pending;
  }

  private restartTimer(itemId: string, pending: Pending): void {
    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    pending.timer = setTimeout(() => {
      pending.timer = null;
      this.sendPending(itemId);
    }, WRITE_DEBOUNCE_MS);
  }

  private dropPending(itemId: string): void {
    const pending = this.pending.get(itemId);
    if (pending?.timer) {
      clearTimeout(pending.timer);
    }
    this.pending.delete(itemId);
  }

  private sendPending(itemId: string): void {
    const pending = this.pending.get(itemId);
    if (!pending || pending.delta === 0) {
      this.pending.delete(itemId);
      return;
    }
    const delta = pending.delta;
    this.pending.delete(itemId);

    this.send(itemId, delta, (id, householdId) =>
      delta > 0
        ? this.api.restock(householdId, id, delta)
        : this.api.consume(householdId, id, -delta));
  }

  /**
   * Encola la escritura en la fila de ese artículo.
   *
   * @param applied cuánto se movió la cifra pintada, para poder deshacerlo si falla
   */
  private send(
    itemId: string,
    applied: number,
    call: (itemId: string, householdId: string) => Observable<PantryItem>,
  ): void {
    const householdId = this.householdId;
    if (!householdId) {
      return;
    }
    this.channel(itemId).next(() =>
      call(itemId, householdId).pipe(
        tap((saved) => this.reconcile(itemId, saved)),
        catchError((error: HttpErrorResponse) => {
          this.recover(itemId, applied, error);
          return of(null);
        }),
      ));
  }

  private channel(itemId: string): Subject<() => Observable<unknown>> {
    let channel = this.channels.get(itemId);
    if (!channel) {
      channel = new Subject<() => Observable<unknown>>();
      channel
        .pipe(concatMap((task) => task()), takeUntilDestroyed(this.destroyRef))
        .subscribe();
      this.channels.set(itemId, channel);
    }
    return channel;
  }

  /**
   * Lo que dijo el servidor, más lo que se haya tocado desde que salió la petición.
   *
   * Pisar la cifra con la del servidor a secas haría saltar el número hacia atrás cada vez
   * que alguien toca mientras la llamada anterior vuelve.
   */
  private reconcile(itemId: string, saved: PantryItem): void {
    const sinMandar = this.pending.get(itemId)?.delta ?? 0;
    this.host?.patch(itemId, {
      quantity: round(saved.quantity + sinMandar),
      version: saved.version,
      expiresAt: saved.expiresAt,
      parLevel: saved.parLevel,
    });
  }

  private recover(itemId: string, applied: number, error: HttpErrorResponse): void {
    const item = this.host?.find(itemId);
    const nombre = item?.product.name ?? 'el artículo';

    if (error.status === 409) {
      const cuerpo = error.error as { currentQuantity?: unknown; currentVersion?: unknown } | null;
      const cantidad = cuerpo?.currentQuantity;
      const version = cuerpo?.currentVersion;

      // Los dos cuerpos del conflicto dan dos mensajes distintos. Con la cantidad actual
      // dentro, la fila se corrige sin preguntar nada más.
      if (typeof cantidad === 'number' && typeof version === 'number') {
        this.dropPending(itemId);
        this.host?.patch(itemId, { quantity: cantidad, version });
        const unidad = item ? unitLabel(item.product.unit) : '';
        this.toasts.warn(
          `Otro miembro cambió ${nombre}`,
          `Ahora hay ${formatQuantity(cantidad)} ${unidad}. Tu cambio no se aplicó.`.trim(),
        );
        return;
      }

      // Sin esos datos no se puede afirmar una cantidad que no se conoce: sólo recargar.
      this.dropPending(itemId);
      this.toasts.warn(
        `Otro miembro cambió ${nombre}`,
        'Tu cambio no se aplicó. Volvemos a cargar la despensa para que veas cómo quedó.',
      );
      this.host?.reload();
      return;
    }

    if (item) {
      this.host?.patch(itemId, { quantity: round(item.quantity - applied) });
    }
    this.toasts.error(
      `No se pudo guardar ${nombre}`,
      'Lo dejamos como estaba. Revisa la conexión y vuelve a intentarlo.',
    );
  }
}

/** Tres decimales, los mismos que guarda la base. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
