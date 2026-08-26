import { ChangeDetectionStrategy, Component } from '@angular/core';

import { EmptyState } from '../../shared/ui/empty-state';

@Component({
  selector: 'app-pantry-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState],
  template: `
    <ui-empty-state
      icon="package"
      title="Tu despensa está vacía"
      description="Cuando agregues artículos aparecerán aquí, con su nivel y su fecha de vencimiento." />
  `,
  styles: `:host { display: grid; place-items: center; min-height: 100%; }`,
})
export class PantryPage {}
