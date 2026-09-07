import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '../core/auth/auth.service';
import { HouseholdContextService } from '../core/household/household-context.service';
import { Icon } from '../shared/ui/icon';
import { ToastHost } from '../shared/ui/toast-host';
import { HouseholdSwitcher } from './household-switcher';
import { NAV_DESTINATIONS, SETTINGS_DESTINATION } from './nav';
import { ThemeToggle } from './theme-toggle';

/**
 * Chasis de la aplicación.
 *
 *  <768px  navegación inferior de 4 destinos, cada uno con área táctil ≥44px.
 *  ≥1024px sidebar persistente con el selector de hogar arriba.
 *  768-1023px  franja intermedia: sigue la barra inferior, que es lo cómodo en
 *              tablet vertical.
 *
 * El contenedor de contenido reserva --bottom-nav-h más el alto del FAB en la
 * franja móvil, para que ni la barra ni el botón flotante tapen la última fila
 * de una lista.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive,
    Icon, ThemeToggle, HouseholdSwitcher, ToastHost,
  ],
  template: `
    <div class="flex min-h-dvh flex-col bg-surface lg:flex-row">

      <!-- ============ SIDEBAR (≥1024px) ============ -->
      <aside
        class="hidden lg:flex lg:w-[var(--sidebar-w)] lg:flex-none lg:flex-col
               lg:border-r lg:border-border lg:bg-surface-raised">

        <div class="flex h-[var(--header-h)] items-center px-4">
          <span class="font-display text-[20px] font-semibold tracking-tight text-text">
            Cellier
          </span>
        </div>

        <div class="px-3 pb-3">
          <app-household-switcher
            [name]="householdName()"
            [memberCount]="householdMemberCount()" />
        </div>

        <nav class="flex-1 px-2" aria-label="Secciones">
          <ul class="flex flex-col gap-0.5">
            @for (item of destinations; track item.segment) {
              <li>
                <a
                  [routerLink]="linkTo(item.segment)"
                  routerLinkActive="is-active"
                  class="nav-link"
                  #rla="routerLinkActive"
                  [attr.aria-current]="rla.isActive ? 'page' : null">
                  <ui-icon [name]="item.icon" [size]="20" />
                  <span>{{ item.label }}</span>
                </a>
              </li>
            }
          </ul>
        </nav>

        <div class="border-t border-border p-2">
          <a
            [routerLink]="settings.path"
            routerLinkActive="is-active"
            class="nav-link"
            #settingsLink="routerLinkActive"
            [attr.aria-current]="settingsLink.isActive ? 'page' : null">
            <ui-icon [name]="settings.icon" [size]="20" />
            <span>{{ settings.label }}</span>
          </a>
        </div>
      </aside>

      <!-- ============ COLUMNA PRINCIPAL ============ -->
      <div class="flex min-w-0 flex-1 flex-col">

        <header
          class="sticky top-0 z-40 flex h-[var(--header-h)] flex-none items-center gap-2
                 border-b border-border bg-surface/95 px-3 backdrop-blur
                 supports-[backdrop-filter]:bg-surface/80 lg:px-6">

          <!-- El selector de hogar sólo aparece en el header cuando no hay sidebar -->
          <div class="min-w-0 flex-1 overflow-hidden lg:hidden">
            <app-household-switcher [name]="householdName()" [compact]="true" />
          </div>

          <!-- En desktop el hogar ya está en el selector del sidebar. Repetirlo aquí
               sería información duplicada, así que el header nombra la sección actual,
               que es lo que el sidebar no dice de forma prominente. -->
          <div class="hidden min-w-0 flex-1 lg:block">
            <h1 class="truncate font-display text-[17px] font-semibold tracking-tight text-text">
              {{ sectionTitle() }}
            </h1>
          </div>

          <app-theme-toggle />

          <button
            type="button"
            class="flex min-h-[var(--touch-min)] min-w-[var(--touch-min)] items-center
                   justify-center rounded-sm transition-colors hover:bg-surface-sunken
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            [attr.aria-label]="'Cuenta de ' + (auth.displayName() || 'invitado')">
            <span
              class="flex h-8 w-8 items-center justify-center rounded-full
                     bg-accent-weak text-[12px] font-semibold text-accent">
              {{ auth.initials() || 'C' }}
            </span>
          </button>
        </header>

        <main
          class="flex min-w-0 flex-1 flex-col px-4 pt-4 lg:px-6 lg:pt-6
                 pb-[calc(var(--bottom-nav-h)+88px+env(safe-area-inset-bottom))]
                 lg:pb-10">
          <div class="flex min-h-full flex-1 flex-col"><router-outlet /></div>
        </main>
      </div>

      <!-- ============ NAVEGACIÓN INFERIOR (<1024px) ============ -->
      <nav
        class="fixed inset-x-0 bottom-0 z-40 flex-none border-t border-border
               bg-surface-raised/95 backdrop-blur lg:hidden
               pb-[env(safe-area-inset-bottom)]"
        aria-label="Secciones">
        <ul class="mx-auto flex max-w-lg">
          @for (item of destinations; track item.segment) {
            <li class="min-w-0 flex-1">
              <a
                [routerLink]="linkTo(item.segment)"
                routerLinkActive="is-active-tab"
                class="tab-link"
                #tab="routerLinkActive"
                [attr.aria-current]="tab.isActive ? 'page' : null">
                <ui-icon [name]="item.icon" [size]="22" />
                <span class="w-full truncate px-0.5 text-center text-[11px] leading-none">
                  {{ item.label }}
                </span>
              </a>
            </li>
          }
        </ul>
      </nav>

      <!-- ============ ACCIÓN PRINCIPAL (<1024px) ============ -->
      <!-- Se apoya sobre la barra inferior. El <main> reserva su alto más el de
           la barra, para que nunca tape la última fila de una lista. -->
      <button
        type="button"
        class="fixed right-4 z-40 flex h-14 w-14 items-center justify-center
               rounded-full bg-accent text-accent-contrast shadow-e2
               transition-[filter,transform] duration-150
               hover:brightness-110 active:translate-y-px
               focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
               lg:hidden"
        style="bottom: calc(var(--bottom-nav-h) + 16px + env(safe-area-inset-bottom));"
        aria-label="Añadir artículo">
        <ui-icon name="plus" [size]="24" />
      </button>

      <ui-toast-host />
    </div>
  `,
  styles: `
    :host { display: block; }

    .nav-link {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: var(--touch-min);
      padding: 0 12px;
      border-radius: var(--radius-md);
      font-size: 15px;
      color: var(--text-muted);
      transition: background-color 150ms, color 150ms;
    }
    .nav-link:hover { background: var(--surface-sunken); color: var(--text); }
    .nav-link.is-active { background: var(--accent-weak); color: var(--accent); font-weight: 500; }
    .nav-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

    .tab-link {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      /* Área táctil completa: nunca por debajo de 44px de alto. */
      min-height: var(--bottom-nav-h);
      min-width: 0;
      padding: 8px 2px;
      color: var(--text-muted);
      transition: color 150ms;
      position: relative;
    }
    .tab-link:hover { color: var(--text); }
    .tab-link.is-active-tab { color: var(--accent); }

    /* El destino activo se marca también con una barra, no sólo con color:
       el color por sí solo no basta (WCAG 1.4.1). */
    .tab-link.is-active-tab::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 28px;
      height: 2px;
      background: var(--accent);
      border-radius: 0 0 2px 2px;
    }
    .tab-link:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  `,
})
export class AppShell {
  protected readonly auth = inject(AuthService);
  private readonly household = inject(HouseholdContextService);
  private readonly router = inject(Router);

  private readonly currentUrl = signal(this.router.url);

  /**
   * Nombre de la sección activa, para el header de desktop. Se compara contra el último
   * segmento y no contra el principio de la URL, porque ahora la sección va detrás del
   * hogar: `/h/<id>/pantry`.
   */
  protected readonly sectionTitle = computed(() => {
    const segments = this.currentUrl().split(/[?#]/, 1)[0].split('/').filter(Boolean);
    const last = segments.at(-1) ?? '';
    if (last === 'settings') {
      return SETTINGS_DESTINATION.label;
    }
    return NAV_DESTINATIONS.find((destination) => destination.segment === last)?.label ?? 'Cellier';
  });

  protected readonly destinations = NAV_DESTINATIONS;
  protected readonly settings = SETTINGS_DESTINATION;

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.currentUrl.set(event.urlAfterRedirects));
  }

  // El perfil ya no se carga aquí: lo garantiza authGuard antes de activar la ruta.
  // Cargarlo en el shell llegaba tarde para las decisiones de hogar, que se toman en el
  // guard y necesitan la lista de hogares ya poblada.

  protected readonly householdName = computed(() => this.household.shellHousehold()?.name ?? 'Cellier');

  protected readonly householdMemberCount = computed(
    () => this.household.shellHousehold()?.memberCount ?? 0,
  );

  /**
   * Enlace a una sección del hogar que rotula el chasis. Devuelve la raíz mientras no haya
   * hogar, y desde ahí la propia raíz decide adónde ir: así el enlace nunca apunta a
   * `/h/null/pantry`.
   */
  protected linkTo(segment: string): readonly string[] {
    const id = this.household.shellHousehold()?.id;
    return id ? ['/h', id, segment] : ['/'];
  }
}
