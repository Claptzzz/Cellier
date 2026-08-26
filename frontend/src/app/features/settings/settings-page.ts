import { ChangeDetectionStrategy, Component } from '@angular/core';

import { EmptyState } from '../../shared/ui/empty-state';

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState],
  template: `
    <ui-empty-state
      icon="gear"
      title="Ajustes"
      description="Preferencias de la cuenta, tema e idioma." />
  `,
  styles: `:host { display: grid; place-items: center; min-height: 100%; }`,
})
export class SettingsPage {}
