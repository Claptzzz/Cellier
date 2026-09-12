import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HouseholdApi } from '../../core/household/household.api';
import { HouseholdContextService } from '../../core/household/household-context.service';
import type { HouseholdDetail } from '../../core/household/household.models';
import { PendingApprovalsService } from '../../core/household/pending-approvals.service';
import { Card } from '../../shared/ui/card';
import { Icon } from '../../shared/ui/icon';
import { Skeleton } from '../../shared/ui/skeleton';
import { JoinCodePanel } from '../household/join-code-panel';

/**
 * El hogar activo: qué es, quién lo administra y cómo invitar.
 *
 * <p>Es además **el camino a la pantalla de gestión**. Sin esa entrada, aprobar
 * solicitudes sólo era posible escribiendo la URL a mano: el distintivo de pendientes
 * vivía sobre este destino y llevaba a una pantalla que no ofrecía cómo resolverlas.
 */
@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Card, Icon, JoinCodePanel, RouterLink, Skeleton],
  template: `
    <div class="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-4">

      <ui-card>
        @if (household(); as hogar) {
          <div class="flex items-center gap-3">
            <span
              class="flex h-12 w-12 flex-none items-center justify-center rounded-lg
                     bg-accent-weak text-[18px] font-semibold text-accent"
              aria-hidden="true">
              {{ inicial() }}
            </span>
            <div class="min-w-0">
              <h2 class="truncate font-display text-[22px] font-semibold tracking-tight text-text">
                {{ hogar.name }}
              </h2>
              <p class="text-[14px] text-text-muted">
                {{ hogar.memberCount }} {{ hogar.memberCount === 1 ? 'persona' : 'personas' }}
                · {{ hogar.role === 'ADMIN' ? 'lo administras' : 'eres miembro' }}
              </p>
            </div>
          </div>
        } @else {
          <div class="flex items-center gap-3" aria-busy="true">
            <ui-skeleton width="48px" height="48px" radius="10px" label="Cargando el hogar" />
            <div class="flex flex-1 flex-col gap-1.5">
              <ui-skeleton width="50%" height="20px" label="" />
              <ui-skeleton width="35%" height="14px" label="" />
            </div>
          </div>
        }
      </ui-card>

      @if (isAdmin()) {
        <!-- La entrada a la gestión. Con el número de solicitudes, para que el distintivo
             de la navegación tenga aquí su continuación y no muera en una pantalla muda. -->
        <a [routerLink]="['..', 'manage']" class="manage-link">
          <span class="flex h-10 w-10 flex-none items-center justify-center rounded-md
                       bg-surface-sunken text-text-muted" aria-hidden="true">
            <ui-icon name="users" [size]="20" />
          </span>

          <span class="min-w-0 flex-1">
            <span class="block text-[15px] font-medium text-text">Administrar el hogar</span>
            <span class="block text-[13px] text-text-muted">
              @if (pending(); as cuantas) {
                {{ cuantas === 1 ? '1 solicitud esperando respuesta' : cuantas + ' solicitudes esperando respuesta' }}
              } @else {
                Miembros, roles y solicitudes de ingreso
              }
            </span>
          </span>

          @if (pending(); as cuantas) {
            <span class="flex-none rounded-full bg-accent px-2 py-0.5 text-[12px]
                         font-semibold text-accent-contrast">{{ cuantas }}</span>
          }

          <span class="chevron flex-none text-text-muted" aria-hidden="true">
            <ui-icon name="caret-down" [size]="18" />
          </span>
        </a>
      }

      <ui-card>
        @if (detail(); as hogar) {
          <app-join-code-panel [code]="hogar.joinCode" [householdName]="hogar.name" />
        } @else {
          <div class="flex flex-col gap-3" aria-busy="true">
            <ui-skeleton width="40%" height="15px" label="Cargando el código de invitación" />
            <ui-skeleton width="100%" height="56px" radius="10px" label="" />
            <ui-skeleton width="160px" height="44px" radius="10px" label="" />
          </div>
        }
      </ui-card>
    </div>
  `,
  styles: `
    :host { display: block; }

    .manage-link {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: var(--touch-min);
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface-raised);
      box-shadow: var(--shadow-1);
      transition: border-color 150ms;
    }
    .manage-link:hover { border-color: var(--border-strong); }
    .manage-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    /* El acento apunta a la derecha: es "entrar en", no "desplegar".
       Se apunta a una clase y no al selector ui-icon:last-of-type: cada icono es hijo unico de
       su span, asi que ambos cumplian ese selector y el de la izquierda salia girado. */
    .manage-link .chevron { display: inline-flex; transform: rotate(-90deg); }
  `,
})
export class HomePage {
  private readonly api = inject(HouseholdApi);
  private readonly context = inject(HouseholdContextService);
  private readonly approvals = inject(PendingApprovalsService);

  protected readonly household = this.context.household;
  protected readonly isAdmin = this.context.isAdmin;
  protected readonly pending = this.approvals.badgeCount;

  protected readonly detail = signal<HouseholdDetail | null>(null);

  protected readonly inicial = computed(
    () => this.household()?.name.trim().charAt(0).toUpperCase() ?? 'C',
  );

  constructor() {
    effect(() => {
      const householdId = this.context.householdId();
      this.detail.set(null);
      if (!householdId) {
        return;
      }
      this.api.get(householdId).subscribe({
        next: (detail) => this.detail.set(detail),
        error: () => this.detail.set(null),
      });
    });
  }
}
