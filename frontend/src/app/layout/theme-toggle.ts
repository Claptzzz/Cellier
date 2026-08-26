import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ThemeService } from '../core/theme/theme.service';
import { Icon } from '../shared/ui/icon';
import type { IconName } from '../shared/ui/icon.data';

/**
 * Alterna claro -> oscuro -> sistema. Un solo botón en vez de tres: el modo
 * actual se lee del icono y del aria-label, que anuncia también a qué se pasa.
 */
@Component({
  selector: 'app-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <button
      type="button"
      class="inline-flex items-center justify-center rounded-sm
             min-h-[var(--touch-min)] min-w-[var(--touch-min)]
             text-text-muted transition-colors duration-150
             hover:bg-surface-sunken hover:text-text
             focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      [attr.aria-label]="ariaLabel()"
      [title]="ariaLabel()"
      (click)="theme.cycle()">
      <ui-icon [name]="icon()" [size]="20" />
    </button>
  `,
  styles: `:host { display: contents; }`,
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);

  private readonly ICONS: Record<'light' | 'dark' | 'system', IconName> = {
    light: 'sun',
    dark: 'moon',
    system: 'desktop',
  };

  private readonly NEXT: Record<'light' | 'dark' | 'system', string> = {
    light: 'oscuro',
    dark: 'seguir al sistema',
    system: 'claro',
  };

  private readonly CURRENT: Record<'light' | 'dark' | 'system', string> = {
    light: 'claro',
    dark: 'oscuro',
    system: 'automático',
  };

  protected readonly icon = computed(() => this.ICONS[this.theme.mode()]);

  protected readonly ariaLabel = computed(() => {
    const mode = this.theme.mode();
    return `Tema ${this.CURRENT[mode]}. Cambiar a ${this.NEXT[mode]}`;
  });
}
