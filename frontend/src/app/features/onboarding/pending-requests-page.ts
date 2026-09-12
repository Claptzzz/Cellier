import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { HouseholdApi } from '../../core/household/household.api';
import { HouseholdContextService } from '../../core/household/household-context.service';
import type { JoinRequestStatus, MyJoinRequest } from '../../core/household/household.models';
import { MyJoinRequestsService } from '../../core/household/my-join-requests.service';
import { ToastService } from '../../core/toast/toast.service';
import { Badge } from '../../shared/ui/badge';
import type { BadgeTone } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import type { IconName } from '../../shared/ui/icon.data';
import { Skeleton } from '../../shared/ui/skeleton';

interface StatusLook {
  readonly label: string;
  readonly tone: BadgeTone;
  readonly icon: IconName;
}

/**
 * Cada estado difiere en texto Y en silueta, no sólo en tono: medido, `ok`, `warn` y
 * `danger` son indistinguibles entre sí en escala de grises.
 */
const STATUS: Record<JoinRequestStatus, StatusLook> = {
  PENDING: { label: 'Esperando respuesta', tone: 'neutral', icon: 'hourglass-medium' },
  APPROVED: { label: 'Aceptada', tone: 'ok', icon: 'check' },
  REJECTED: { label: 'No aceptada', tone: 'danger', icon: 'x-circle' },
  CANCELLED: { label: 'Cancelada por ti', tone: 'neutral', icon: 'prohibit' },
};

/**
 * Las solicitudes que ha enviado el usuario.
 *
 * <p>Tiene URL propia y se puede consultar cuando se quiera: quien pide entrar en un hogar
 * cierra la pestaña y vuelve al día siguiente a ver si le respondieron. Un mensaje efímero
 * tras enviar la solicitud no serviría para eso.
 *
 * <p>Se recarga en cada visita, a diferencia del resto de la aplicación: es información que
 * cambia por decisión de OTRA persona, así que venir a mirarla es exactamente el gesto de
 * quien quiere saber si ya hay respuesta.
 */
@Component({
  selector: 'app-pending-requests-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, Button, Card, DatePipe, EmptyState, Icon, RouterLink, Skeleton],
  // Los botones de cada fila van a tamaño medio (44px) y no `sm` (36px): son la acción
  // principal de su tarjeta y esta pantalla se usa sobre todo en el móvil, donde el
  // sistema fija --touch-min en 44px. `sm` está para filas densas de escritorio.
  template: `
    <main class="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-4 py-10">

      <header class="mb-6 flex flex-col items-center text-center">
        <span
          class="mb-4 flex h-12 w-12 items-center justify-center rounded-lg
                 bg-surface-sunken text-text-muted"
          aria-hidden="true">
          <ui-icon name="hourglass-medium" [size]="26" />
        </span>
        <h1 class="font-display text-[28px] font-semibold leading-tight tracking-tight text-text">
          Tus solicitudes
        </h1>
        <p class="mt-2 max-w-[42ch] text-[15px] leading-relaxed text-text-muted">
          Quien administra el hogar tiene que aceptarlas. Puedes cerrar esta página y volver
          más tarde.
        </p>
      </header>

      @if (loading()) {
        <!-- Esqueleto con la forma de la lista, no un indicador centrado: así el
             contenido no salta de sitio al llegar. -->
        <div class="flex flex-col gap-3" aria-busy="true">
          @for (fila of [1, 2]; track fila) {
            <ui-card>
              <div class="flex flex-col gap-3">
                <div class="flex items-center justify-between gap-3">
                  <ui-skeleton width="45%" height="18px" label="Cargando solicitud" />
                  <ui-skeleton width="120px" height="22px" radius="999px" label="" />
                </div>
                <ui-skeleton width="60%" height="14px" label="" />
              </div>
            </ui-card>
          }
        </div>

      } @else if (requests().length === 0) {
        <ui-empty-state
          icon="tray"
          title="Todavía no has pedido entrar a ningún hogar"
          description="Cuando envíes una solicitud aparecerá aquí, con su respuesta.">
          <ui-button variant="primary" link="/onboarding">Crear o unirte a un hogar</ui-button>
        </ui-empty-state>

      } @else {
        <ul class="flex flex-col gap-3">
          @for (request of requests(); track request.id) {
            <li>
              <ui-card>
                <div class="flex flex-col gap-3">
                  <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                    <p class="min-w-0 flex-1 text-[16px] font-medium text-text">
                      {{ request.householdName }}
                    </p>
                    <ui-badge [tone]="look(request.status).tone" [icon]="look(request.status).icon">
                      {{ look(request.status).label }}
                    </ui-badge>
                  </div>

                  <p class="text-[13px] text-text-muted">
                    Enviada el {{ request.requestedAt | date: 'd MMM y, HH:mm' }}
                    @if (request.resolvedAt) {
                      · respondida el {{ request.resolvedAt | date: 'd MMM y' }}
                    }
                  </p>

                  @if (request.status === 'PENDING') {
                    <div class="flex">
                      <ui-button
                        variant="ghost"
                        icon="x"
                        [loading]="cancelling() === request.id"
                        (pressed)="cancel(request)">
                        Retirar solicitud
                      </ui-button>
                    </div>
                  } @else if (request.status === 'APPROVED') {
                    <div class="flex">
                      <ui-button
                        variant="secondary"
                        [link]="['/h', request.householdId, 'pantry']">
                        Entrar a {{ request.householdName }}
                      </ui-button>
                    </div>
                  } @else if (request.status === 'REJECTED' || request.status === 'CANCELLED') {
                    <p class="text-[13px] text-text-muted">
                      Puedes volver a pedirlo con el código del hogar.
                    </p>
                  }
                </div>
              </ui-card>
            </li>
          }
        </ul>

        <div class="mt-8 text-center">
          <a
            routerLink="/onboarding"
            class="text-[14px] text-accent underline underline-offset-4
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            {{ hasHouseholds() ? 'Crear o unirte a otro hogar' : 'Crear tu propio hogar' }}
          </a>
        </div>
      }
    </main>
  `,
  styles: `:host { display: block; }`,
})
export class PendingRequestsPage {
  private readonly api = inject(HouseholdApi);
  private readonly myRequests = inject(MyJoinRequestsService);
  private readonly context = inject(HouseholdContextService);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly cancelling = signal<string | null>(null);

  protected readonly requests = this.myRequests.requests;
  protected readonly hasHouseholds = this.context.hasHouseholds;

  constructor() {
    // Recarga siempre. Venir aquí es el gesto de preguntar «¿ya me respondieron?», y
    // servir lo cacheado respondería con lo que ya se sabía.
    this.myRequests.reload().subscribe(() => this.loading.set(false));
  }

  protected look(status: JoinRequestStatus): StatusLook {
    return STATUS[status];
  }

  /**
   * Retira una solicitud propia. No pide confirmación en un diálogo a propósito: es
   * reversible —se puede volver a solicitar al mismo hogar en cuanto se retira— y el
   * botón ya dice exactamente qué hace. Los diálogos se reservan para lo que no tiene
   * vuelta atrás.
   */
  protected cancel(request: MyJoinRequest): void {
    this.cancelling.set(request.id);

    this.api.cancelJoinRequest(request.id).subscribe({
      next: () => {
        this.cancelling.set(null);
        this.toast.success('Solicitud retirada', `Ya no esperas respuesta de ${request.householdName}.`);
        this.myRequests.reload().subscribe();
      },
      error: () => {
        this.cancelling.set(null);
        // El aviso del error lo da el interceptor. Aquí se recarga porque el motivo más
        // probable de un 409 es que alguien la haya resuelto mientras tanto, y entonces
        // lo que la pantalla muestra ya no es cierto.
        this.myRequests.reload().subscribe();
      },
    });
  }
}
