import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '../core/auth/auth.service';
import { HouseholdContextService } from '../core/household/household-context.service';
import { PendingApprovalsService } from '../core/household/pending-approvals.service';
import { Icon } from '../shared/ui/icon';
import { AccountMenu } from './account-menu';
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
 * El contenedor de contenido reserva --bottom-nav-h más el alto del botón flotante
 * en la franja móvil, para que ni la barra ni el botón tapen la última fila de una
 * lista. El botón NO vive aquí: lo pone la pantalla que tiene algo que añadir, que es
 * la que sabe qué hace al pulsarlo. Aquí sólo se le guarda el sitio.
 */
/** Secciones con pantalla propia que no son destinos de la navegación. */
const EXTRA_SECTIONS: Record<string, string> = {
  manage: 'Administrar hogar',
};

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive,
    AccountMenu, Icon, ThemeToggle, HouseholdSwitcher,
  ],
  template: `
    <div class="flex min-h-dvh flex-col bg-surface lg:flex-row">

      <!-- Primer elemento tabulable: quien navega con teclado no tiene que recorrer toda
           la navegación en cada pantalla para llegar al contenido. -->
      <a href="#contenido" class="skip-link">Saltar al contenido</a>

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
            [households]="households()"
            [activeId]="activeHouseholdId()"
            (selected)="switchHousehold($event)"
            (joinAnother)="goToOnboarding()" />
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
                  <span class="flex-1">{{ item.label }}</span>
                  @if (item.segment === 'home' && pendingApprovals() !== null) {
                    <span class="nav-count" [attr.aria-label]="pendingLabel()">
                      {{ pendingApprovals() }}
                    </span>
                  }
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
            <app-household-switcher
              [households]="households()"
              [activeId]="activeHouseholdId()"
              [compact]="true"
              (selected)="switchHousehold($event)"
              (joinAnother)="goToOnboarding()" />
          </div>

          <!-- En desktop el hogar ya está en el selector del sidebar. Repetirlo aquí
               sería información duplicada, así que el header nombra la sección actual,
               que es lo que el sidebar no dice de forma prominente.

               El h1 existe en los dos anchos: en móvil sólo se oculta a la vista. Sin él
               la página no tenía encabezado de nivel 1 por debajo de 1024px, y el esquema
               de encabezados empezaba en h2. -->
          <div class="min-w-0 flex-1 max-lg:sr-only lg:block">
            <h1 class="truncate font-display text-[17px] font-semibold tracking-tight text-text">
              {{ sectionTitle() }}
            </h1>
          </div>

          <app-theme-toggle />

          <app-account-menu />
        </header>

        <main
          id="contenido"
          tabindex="-1"
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
                <span class="relative">
                  <ui-icon [name]="item.icon" [size]="22" />
                  @if (item.segment === 'home' && pendingApprovals() !== null) {
                    <span class="tab-count" [attr.aria-label]="pendingLabel()">
                      {{ pendingApprovals() }}
                    </span>
                  }
                </span>
                <span class="w-full truncate px-0.5 text-center text-[11px] leading-none">
                  {{ item.label }}
                </span>
              </a>
            </li>
          }
        </ul>
      </nav>

    </div>
  `,
  styles: `
    :host { display: block; }

    /* Fuera de la vista hasta que recibe el foco, y entonces por encima de la cabecera
       pegajosa: un enlace de salto tapado por el propio chasis no sirve de nada. */
    .skip-link {
      position: fixed;
      top: 8px;
      left: 8px;
      z-index: 60;
      padding: 10px 14px;
      border-radius: var(--radius-md);
      background: var(--accent);
      color: var(--accent-contrast);
      font-size: 15px;
      font-weight: 500;
      transform: translateY(-200%);
      transition: transform 150ms;
    }
    .skip-link:focus-visible {
      transform: translateY(0);
      outline: 2px solid var(--text);
      outline-offset: 2px;
    }

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

    /* Cuenta de solicitudes por resolver. El número ES el dato: un punto de color solo
       diría "algo pasa" sin decir cuánto, y además el color no basta (WCAG 1.4.1). */
    .nav-count {
      flex: none;
      min-width: 20px;
      padding: 0 6px;
      border-radius: 999px;
      background: var(--accent);
      color: var(--accent-contrast);
      font-size: 12px;
      font-weight: 600;
      line-height: 20px;
      text-align: center;
    }

    .tab-count {
      position: absolute;
      top: -6px;
      left: 12px;
      min-width: 18px;
      padding: 0 5px;
      border-radius: 999px;
      background: var(--accent);
      color: var(--accent-contrast);
      font-size: 11px;
      font-weight: 600;
      line-height: 18px;
      text-align: center;
      /* Anillo del color del fondo de la barra: separa el número del icono sin
         necesitar un borde que en oscuro se vería como un halo. */
      box-shadow: 0 0 0 2px var(--surface-raised);
    }
  `,
})
export class AppShell {
  protected readonly auth = inject(AuthService);
  private readonly household = inject(HouseholdContextService);
  private readonly pending = inject(PendingApprovalsService);
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

    // Se prueba el último segmento y, si no dice nada, el anterior. Una pantalla de detalle
    // —/templates/:id— termina en un identificador que no rotula nada, pero pertenece a la
    // sección que lo precede. Sin este segundo intento, la cabecera de escritorio decía
    // "Cellier" en cuanto se abría un detalle, que es no decir dónde estás.
    for (const segment of [last, segments.at(-2) ?? '']) {
      const label =
        NAV_DESTINATIONS.find((destination) => destination.segment === segment)?.label ??
        // Secciones que no están en la navegación pero sí tienen nombre propio.
        EXTRA_SECTIONS[segment];
      if (label) {
        return label;
      }
    }
    return 'Cellier';
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

  protected readonly households = this.household.households;

  /**
   * Cuál sale marcado en el selector. Fuera de `/h/:householdId` —en Ajustes— no hay hogar
   * activo, y se rotula con el de arranque para que la navegación siga sabiendo a cuál
   * volver.
   */
  protected readonly activeHouseholdId = computed(() => this.household.shellHousehold()?.id ?? null);

  protected readonly pendingApprovals = this.pending.badgeCount;


  protected readonly pendingLabel = computed(() => {
    const count = this.pendingApprovals();
    return count === 1
      ? '1 solicitud de ingreso por resolver'
      : `${count} solicitudes de ingreso por resolver`;
  });

  /**
   * Cambiar de hogar conserva la sección: quien está mirando las recetas de una casa y
   * cambia a otra quiere ver las recetas de la otra, no volver a la despensa.
   */
  protected switchHousehold(householdId: string): void {
    void this.router.navigate(['/h', householdId, this.currentSection()]);
  }

  protected goToOnboarding(): void {
    void this.router.navigate(['/onboarding']);
  }

  /** La sección de la URL actual, o la despensa si no se reconoce ninguna. */
  private currentSection(): string {
    const segments = this.currentUrl().split(/[?#]/, 1)[0].split('/').filter(Boolean);
    // ['h', '<id>', '<sección>', …]
    const section = segments.length > 2 ? segments[2] : 'pantry';
    return NAV_DESTINATIONS.some((d) => d.segment === section) ? section : 'pantry';
  }

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
