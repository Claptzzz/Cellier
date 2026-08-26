import { ChangeDetectionStrategy, Component } from '@angular/core';

import { EmptyState } from '../../shared/ui/empty-state';

@Component({
  selector: 'app-templates-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState],
  template: `
    <ui-empty-state
      icon="list-checks"
      title="Sin plantillas"
      description="Las plantillas son listas de compra recurrentes: la del supermercado, la de la feria." />
  `,
  styles: `:host { display: grid; place-items: center; min-height: 100%; }`,
})
export class TemplatesPage {}
