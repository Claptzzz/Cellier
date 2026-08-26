import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { Icon } from '../shared/ui/icon';

/**
 * Selector de hogar.
 *
 * El nombre del hogar va en Geist, NO en Bricolage. La display se reserva a
 * ≥20px; aquí el texto es de 15px y a ese tamaño las terminales irregulares de
 * Bricolage se emborronan en vez de aportar carácter.
 */
@Component({
  selector: 'app-household-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <button
      type="button"
      [class]="compact()
        ? 'w-fit max-w-full gap-2 rounded-full py-1.5 pl-2 pr-2.5 min-h-[var(--touch-min)]'
        : 'w-full gap-3 rounded-md p-3'"
      class="flex min-w-0 items-center border border-border bg-surface-raised text-left
             transition-colors duration-150 hover:border-border-strong
             focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      [attr.aria-label]="'Hogar activo: ' + name() + '. Cambiar de hogar'">

      <span
        class="flex h-7 w-7 flex-none items-center justify-center rounded-sm
               bg-accent-weak text-[12px] font-semibold text-accent"
        aria-hidden="true">
        {{ badge() }}
      </span>

      <span class="min-w-0 flex-1">
        <span class="block truncate text-[15px] font-medium text-text">{{ name() }}</span>
        @if (!compact() && memberCount() > 0) {
          <span class="block text-[13px] text-text-muted">
            {{ memberCount() }} {{ memberCount() === 1 ? 'miembro' : 'miembros' }}
          </span>
        }
      </span>

      <span class="flex-none text-text-muted"><ui-icon name="caret-up-down" [size]="16" /></span>
    </button>
  `,
  styles: `:host { display: block; }`,
})
export class HouseholdSwitcher {
  readonly name = input.required<string>();
  readonly memberCount = input(0);
  readonly compact = input(false);

  protected badge(): string {
    return this.name().trim().charAt(0).toUpperCase() || 'C';
  }
}
