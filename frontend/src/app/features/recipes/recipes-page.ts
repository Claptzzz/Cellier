import { ChangeDetectionStrategy, Component } from '@angular/core';

import { EmptyState } from '../../shared/ui/empty-state';

@Component({
  selector: 'app-recipes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState],
  template: `
    <ui-empty-state
      icon="fork-knife"
      title="Sin recetas"
      description="Guarda recetas y Cellier te dirá qué ingredientes ya tienes en la despensa." />
  `,
  styles: `:host { display: grid; place-items: center; min-height: 100%; }`,
})
export class RecipesPage {}
