import { ChangeDetectionStrategy, Component } from '@angular/core';

import { EmptyState } from '../../shared/ui/empty-state';

/**
 * Marcador de posición. La pantalla real —solicitudes pendientes, miembros con sus
 * acciones y el código de invitación— llega en su propio cambio.
 *
 * La ruta existe desde ya porque `householdAdminGuard` cuelga de ella.
 */
@Component({
  selector: 'app-manage-household-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState],
  template: `
    <ui-empty-state
      icon="users"
      title="Administrar el hogar"
      description="Aquí van las solicitudes pendientes, los miembros y el código de invitación." />
  `,
  styles: `:host { display: grid; place-items: center; min-height: 100%; }`,
})
export class ManageHouseholdPage {}
