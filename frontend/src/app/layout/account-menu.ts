import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../core/auth/auth.service';
import { ViewportService } from '../core/layout/viewport.service';
import { BottomSheet } from '../shared/ui/bottom-sheet';
import { Icon } from '../shared/ui/icon';
import { Menu } from '../shared/ui/menu';
import { SETTINGS_DESTINATION } from './nav';

/**
 * El menú de la cuenta.
 *
 * <p>Existe porque sin él había dos pantallas sin camino: **Ajustes era inalcanzable en
 * móvil** —su único enlace vivía en el pie de la barra lateral, que no se muestra por
 * debajo de 1024px— y **cerrar sesión no lo llamaba nadie en toda la aplicación**. El
 * avatar de la cabecera era un botón sin acción.
 */
@Component({
  selector: 'app-account-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BottomSheet, Icon, Menu, NgTemplateOutlet, RouterLink],
  template: `
    <div class="relative">
      <button
        type="button"
        class="flex min-h-[var(--touch-min)] min-w-[var(--touch-min)] items-center
               justify-center rounded-sm transition-colors hover:bg-surface-sunken
               focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="'Cuenta de ' + (auth.displayName() || 'invitado')"
        (click)="toggle()">
        <span
          class="flex h-8 w-8 items-center justify-center rounded-full
                 bg-accent-weak text-[12px] font-semibold text-accent"
          aria-hidden="true">
          {{ auth.initials() || 'C' }}
        </span>
      </button>

      <ng-template #contenido>
        <div class="px-2 pb-2 pt-1">
          <p class="truncate text-[15px] font-medium text-text">{{ auth.displayName() }}</p>
          <p class="truncate text-[13px] text-text-muted">{{ auth.user()?.email }}</p>
        </div>

        <div class="flex flex-col gap-0.5 border-t border-border pt-1">
          <a [routerLink]="settings.path" class="account-item" (click)="open.set(false)">
            <ui-icon [name]="settings.icon" [size]="18" />
            <span>{{ settings.label }}</span>
          </a>

          <button type="button" class="account-item account-item--danger" (click)="signOut()">
            <ui-icon name="sign-out" [size]="18" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </ng-template>

      @if (isDesktop()) {
        <ui-menu [open]="open()" align="end" label="Tu cuenta" (closed)="open.set(false)">
          <ng-container *ngTemplateOutlet="contenido" />
        </ui-menu>
      }
    </div>

    @if (!isDesktop()) {
      <ui-bottom-sheet [open]="open()" title="Tu cuenta" (closed)="open.set(false)">
        <ng-container *ngTemplateOutlet="contenido" />
      </ui-bottom-sheet>
    }
  `,
  styles: `
    :host { display: contents; }

    .account-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: var(--touch-min);
      padding: 0 10px;
      border-radius: var(--radius-md);
      font-size: 15px;
      color: var(--text);
      text-align: left;
      transition: background-color 150ms;
    }
    .account-item:hover { background: var(--surface-sunken); }
    .account-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
    .account-item--danger { color: var(--danger); }
  `,
})
export class AccountMenu {
  protected readonly auth = inject(AuthService);
  private readonly viewport = inject(ViewportService);
  private readonly router = inject(Router);

  protected readonly open = signal(false);
  protected readonly isDesktop = this.viewport.isDesktop;
  protected readonly settings = SETTINGS_DESTINATION;

  constructor() {
    effect(() => {
      this.viewport.breakpointChanged();
      this.open.set(false);
    });
  }

  protected toggle(): void {
    this.open.update((current) => !current);
  }

  protected signOut(): void {
    this.open.set(false);
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
