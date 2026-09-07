import { ChangeDetectionStrategy, Component } from '@angular/core';

import { EmptyState } from '../../shared/ui/empty-state';

/**
 * Marcador de posición. La pantalla real —solicitudes enviadas, su estado y la opción de
 * cancelarlas— llega con el resto del onboarding.
 *
 * La ruta existe desde ya porque el guard redirige aquí: es el tercer estado de arranque,
 * el de quien no tiene hogares pero sí una solicitud esperando respuesta.
 */
@Component({
  selector: 'app-pending-requests-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState],
  template: `
    <ui-empty-state
      icon="hourglass-medium"
      title="Tu solicitud está esperando"
      description="Quien administra el hogar tiene que aceptarla. Puedes cerrar esta página y volver más tarde." />
  `,
  styles: `:host { display: grid; place-items: center; min-height: 100dvh; padding: 24px; }`,
})
export class PendingRequestsPage {}
