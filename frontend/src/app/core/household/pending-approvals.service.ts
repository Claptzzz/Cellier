import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { HouseholdApi } from './household.api';
import { HouseholdContextService } from './household-context.service';

/**
 * Cuántas solicitudes esperan respuesta en el hogar activo.
 *
 * <p>Sólo tiene sentido para quien lo administra: es quien puede resolverlas, y el
 * endpoint sólo responde a administradores. Para el resto vale `null` y no se pide nada.
 *
 * <p>`null` significa «todavía no lo sé», y es distinto de `0`. La navegación sólo pinta
 * el distintivo cuando hay un número mayor que cero, así que un recuento desconocido no
 * puede convertirse en un «no hay nada» dibujado.
 */
@Injectable({ providedIn: 'root' })
export class PendingApprovalsService {
  private readonly api = inject(HouseholdApi);
  private readonly context = inject(HouseholdContextService);

  private readonly value = signal<number | null>(null);

  /** Número de solicitudes pendientes, o `null` mientras no se sepa. */
  readonly count = this.value.asReadonly();

  /** Lo que la navegación necesita: un número que merezca dibujarse. */
  readonly badgeCount = computed(() => {
    const current = this.value();
    return current !== null && current > 0 ? current : null;
  });

  constructor() {
    effect(() => {
      const household = this.context.household();

      // Al cambiar de hogar el recuento anterior deja de ser cierto, y hay que volver a
      // "no lo sé" antes de pedir el nuevo: conservarlo mostraría el distintivo del hogar
      // del que se acaba de salir.
      this.value.set(null);

      if (!household || household.role !== 'ADMIN') {
        return;
      }
      this.load(household.id);
    });
  }

  /** Tras aprobar o rechazar, el recuento cambió. */
  refresh(): void {
    const household = this.context.household();
    if (household?.role === 'ADMIN') {
      this.load(household.id);
    }
  }

  private load(householdId: string): void {
    this.api.joinRequests(householdId, 'PENDING').subscribe({
      next: (requests) => this.value.set(requests.length),
      // Un fallo deja el recuento en «no lo sé». El distintivo no aparece, que es
      // preferible a afirmar un cero que nadie ha comprobado.
      error: () => this.value.set(null),
    });
  }
}
