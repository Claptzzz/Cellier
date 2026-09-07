import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

import { ViewportService } from '../core/layout/viewport.service';
import type { HouseholdSummary } from '../core/household/household.models';
import { BottomSheet } from '../shared/ui/bottom-sheet';
import { Icon } from '../shared/ui/icon';
import { Menu } from '../shared/ui/menu';

/**
 * Selector de hogar.
 *
 * <p>El nombre del hogar va en Geist, NO en Bricolage. La display se reserva a ≥20px;
 * aquí el texto es de 15px y a ese tamaño las terminales irregulares de Bricolage se
 * emborronan en vez de aportar carácter.
 *
 * <p>La lista se escribe una sola vez y se coloca en dos contenedores distintos según el
 * ancho: hoja inferior donde llega el pulgar, panel anclado donde está el cursor. Se
 * renderiza sólo uno de los dos —no ambos ocultos por CSS— porque los dos son `<dialog>`
 * y abrirlos a la vez dejaría dos capas modales apiladas.
 */
@Component({
  selector: 'app-household-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BottomSheet, Icon, Menu, NgTemplateOutlet],
  template: `
    <div class="relative">
      <button
        type="button"
        [class]="triggerClasses()"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="triggerLabel()"
        (click)="toggle()">

        <span
          class="flex h-7 w-7 flex-none items-center justify-center rounded-sm
                 bg-accent-weak text-[12px] font-semibold text-accent"
          aria-hidden="true">
          {{ initial() }}
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

      <!-- El contenido, una sola vez. -->
      <ng-template #lista>
        <ul class="flex flex-col gap-0.5">
          @for (household of households(); track household.id) {
            <li>
              <button
                type="button"
                class="switch-item"
                [class.is-active]="household.id === activeId()"
                [attr.aria-current]="household.id === activeId() ? 'true' : null"
                (click)="choose(household.id)">
                <span
                  class="flex h-8 w-8 flex-none items-center justify-center rounded-sm
                         bg-accent-weak text-[12px] font-semibold text-accent"
                  aria-hidden="true">
                  {{ initialOf(household.name) }}
                </span>

                <span class="min-w-0 flex-1 text-left">
                  <span class="block truncate text-[15px] font-medium text-text">
                    {{ household.name }}
                  </span>
                  <span class="block text-[13px] text-text-muted">
                    {{ household.role === 'ADMIN' ? 'Administras' : 'Miembro' }}
                    · {{ household.memberCount }}
                    {{ household.memberCount === 1 ? 'persona' : 'personas' }}
                  </span>
                </span>

                @if (household.id === activeId()) {
                  <span class="flex-none text-accent" aria-hidden="true">
                    <ui-icon name="check" [size]="18" />
                  </span>
                }
              </button>
            </li>
          }
        </ul>

        <div class="mt-1 border-t border-border pt-1">
          <button type="button" class="switch-item" (click)="join()">
            <span
              class="flex h-8 w-8 flex-none items-center justify-center rounded-sm
                     bg-surface-sunken text-text-muted"
              aria-hidden="true">
              <ui-icon name="user-plus" [size]="18" />
            </span>
            <span class="min-w-0 flex-1 text-left text-[15px] font-medium text-text">
              Unirte a otro hogar
            </span>
          </button>
        </div>
      </ng-template>

      @if (isDesktop()) {
        <ui-menu [open]="open()" label="Tus hogares" (closed)="open.set(false)">
          <ng-container *ngTemplateOutlet="lista" />
        </ui-menu>
      }
    </div>

    @if (!isDesktop()) {
      <ui-bottom-sheet [open]="open()" title="Tus hogares" (closed)="open.set(false)">
        <ng-container *ngTemplateOutlet="lista" />
      </ui-bottom-sheet>
    }
  `,
  styles: `
    :host { display: block; }

    .switch-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: var(--touch-min);
      padding: 8px;
      border-radius: var(--radius-md);
      transition: background-color 150ms;
    }
    .switch-item:hover { background: var(--surface-sunken); }
    .switch-item.is-active { background: var(--accent-weak); }
    .switch-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  `,
})
export class HouseholdSwitcher {
  readonly households = input<readonly HouseholdSummary[]>([]);
  readonly activeId = input<string | null>(null);
  readonly compact = input(false);

  readonly selected = output<string>();
  readonly joinAnother = output<void>();

  protected readonly open = signal(false);

  private readonly viewport = inject(ViewportService);

  protected readonly isDesktop = this.viewport.isDesktop;

  protected readonly active = computed(
    () => this.households().find((candidate) => candidate.id === this.activeId()) ?? null,
  );

  protected readonly name = computed(() => this.active()?.name ?? 'Cellier');
  protected readonly memberCount = computed(() => this.active()?.memberCount ?? 0);
  protected readonly initial = computed(() => this.initialOf(this.name()));

  protected readonly triggerLabel = computed(
    () => `Hogar activo: ${this.name()}. Cambiar de hogar`,
  );

  protected readonly triggerClasses = computed(() =>
    [
      'flex min-w-0 items-center border border-border bg-surface-raised text-left',
      'transition-colors duration-150 hover:border-border-strong',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      this.compact()
        ? 'w-fit max-w-full gap-2 rounded-full py-1.5 pl-2 pr-2.5 min-h-[var(--touch-min)]'
        : 'w-full gap-3 rounded-md p-3',
    ].join(' '),
  );

  constructor() {
    // Girar el dispositivo con el selector abierto dejaría el contenido en un contenedor
    // que se desmonta: se cierra y ya está.
    effect(() => {
      this.viewport.breakpointChanged();
      this.open.set(false);
    });
  }

  protected initialOf(name: string): string {
    return name.trim().charAt(0).toUpperCase() || 'C';
  }

  protected toggle(): void {
    this.open.update((current) => !current);
  }

  protected choose(householdId: string): void {
    this.open.set(false);
    if (householdId !== this.activeId()) {
      this.selected.emit(householdId);
    }
  }

  protected join(): void {
    this.open.set(false);
    this.joinAnother.emit();
  }
}
