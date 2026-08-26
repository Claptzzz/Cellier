import { ChangeDetectionStrategy, Component } from '@angular/core';

import { EmptyState } from '../../shared/ui/empty-state';

@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState],
  template: `
    <ui-empty-state
      icon="house"
      title="Tu hogar"
      description="Aquí verás a los miembros del hogar, sus roles y las invitaciones pendientes." />
  `,
  styles: `:host { display: grid; place-items: center; min-height: 100%; }`,
})
export class HomePage {}
