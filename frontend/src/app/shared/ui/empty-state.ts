import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { Icon } from './icon';
import type { IconName } from './icon.data';

/**
 * Estado vacío. Dice qué falta y cómo llenarlo; nunca se queda en "no hay nada".
 * El hueco para la acción es un ng-content, así el componente no decide el destino.
 */
@Component({
  selector: 'ui-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span
        class="flex h-12 w-12 items-center justify-center rounded-lg
               bg-surface-sunken text-text-muted">
        <ui-icon [name]="icon()" [size]="24" />
      </span>

      <h2 class="font-display text-[20px] font-semibold tracking-tight text-text">
        {{ title() }}
      </h2>

      @if (description()) {
        <p class="max-w-[42ch] text-[14px] leading-relaxed text-text-muted">
          {{ description() }}
        </p>
      }

      <div class="mt-2 empty:hidden"><ng-content /></div>
    </div>
  `,
  styles: `:host { display: block; }`,
})
export class EmptyState {
  readonly icon = input<IconName>('tray');
  readonly title = input.required<string>();
  readonly description = input<string>('');
}
