import { ChangeDetectionStrategy, Component } from '@angular/core';

import { EmptyState } from '../../shared/ui/empty-state';

@Component({
  selector: 'app-onboarding-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState],
  template: `
    <ui-empty-state
      icon="house"
      title="Crea tu primer hogar"
      description="Un hogar agrupa la despensa, las plantillas y las recetas que comparten quienes viven contigo." />
  `,
  styles: `:host { display: grid; place-items: center; min-height: 100%; }`,
})
export class OnboardingPage {}
