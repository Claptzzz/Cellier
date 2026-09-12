import { NgTemplateOutlet } from '@angular/common';
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

import type { HouseholdMember } from '../../core/household/household.models';
import { ViewportService } from '../../core/layout/viewport.service';
import { Badge } from '../../shared/ui/badge';
import { BottomSheet } from '../../shared/ui/bottom-sheet';
import { Icon } from '../../shared/ui/icon';
import { IconButton } from '../../shared/ui/icon-button';
import { Menu } from '../../shared/ui/menu';
import { MemberAvatar } from './member-avatar';

/**
 * Una persona del hogar, con sus acciones.
 *
 * <p>Las acciones se despliegan en hoja inferior o en panel anclado según el ancho, igual
 * que el selector de hogar. En escritorio el panel se coloca midiendo el sitio que queda:
 * abierto en la última fila de una lista larga crecería fuera de la pantalla.
 *
 * <p><strong>Al último administrador se le deshabilitan las acciones y se explica por
 * qué, aquí mismo.</strong> El servidor también lo impide con un 409, pero enterarse por
 * un error después de pulsar es enterarse tarde: la interfaz ya sabe contar cuántos
 * administradores hay.
 */
@Component({
  selector: 'app-member-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, BottomSheet, Icon, IconButton, MemberAvatar, Menu, NgTemplateOutlet],
  template: `
    <div class="flex items-center gap-3 px-1 py-2">
      <app-member-avatar [displayName]="member().displayName" [avatarUrl]="member().avatarUrl" />

      <div class="min-w-0 flex-1">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span class="truncate text-[15px] font-medium text-text">
            {{ member().displayName }}
          </span>
          @if (isMe()) {
            <span class="text-[13px] text-text-muted">(tú)</span>
          }
        </p>
        <p class="truncate text-[13px] text-text-muted">{{ member().email }}</p>
      </div>

      <div class="flex flex-none items-center gap-2">
        @if (member().role === 'ADMIN') {
          <ui-badge tone="accent" icon="shield-check">Administra</ui-badge>
        }

        <div class="relative">
          <ui-icon-button
            name="dots-three"
            [label]="'Acciones sobre ' + member().displayName"
            [disabled]="busy()"
            [pressedState]="open()"
            (pressed)="toggle()" />

          <ng-template #acciones>
            @if (isLastAdmin()) {
              <!-- El motivo va donde está la acción, no en un aviso posterior. -->
              <p class="flex items-start gap-2 px-2 py-2 text-left text-[13px] leading-relaxed text-text-muted">
                <span class="mt-0.5 flex-none text-warn"><ui-icon name="warning" [size]="15" /></span>
                <span>
                  El hogar tiene que conservar al menos un administrador.
                  Promueve a otra persona para poder cambiar esto.
                </span>
              </p>
            }

            <div class="flex flex-col gap-0.5">
              @if (member().role === 'MEMBER') {
                <button type="button" class="row-action" (click)="run('promote')">
                  <ui-icon name="shield-check" [size]="18" />
                  <span>Hacer administrador</span>
                </button>
              } @else {
                <button
                  type="button"
                  class="row-action"
                  [disabled]="isLastAdmin()"
                  (click)="run('demote')">
                  <ui-icon name="user-minus" [size]="18" />
                  <span>Quitar administrador</span>
                </button>
              }

              <button
                type="button"
                class="row-action row-action--danger"
                [disabled]="isLastAdmin()"
                (click)="run('remove')">
                <ui-icon name="sign-out" [size]="18" />
                <span>{{ isMe() ? 'Salir del hogar' : 'Expulsar del hogar' }}</span>
              </button>
            </div>
          </ng-template>

          @if (isDesktop()) {
            <ui-menu
              [open]="open()"
              align="end"
              [label]="'Acciones sobre ' + member().displayName"
              (closed)="open.set(false)">
              <ng-container *ngTemplateOutlet="acciones" />
            </ui-menu>
          }
        </div>
      </div>
    </div>

    @if (!isDesktop()) {
      <ui-bottom-sheet [open]="open()" [title]="member().displayName" (closed)="open.set(false)">
        <ng-container *ngTemplateOutlet="acciones" />
      </ui-bottom-sheet>
    }
  `,
  styles: `
    :host { display: block; }

    .row-action {
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
    .row-action:hover:not(:disabled) { background: var(--surface-sunken); }
    .row-action:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
    .row-action:disabled { opacity: 0.45; cursor: not-allowed; }
    .row-action--danger:not(:disabled) { color: var(--danger); }
  `,
})
export class MemberRow {
  private readonly viewport = inject(ViewportService);

  readonly member = input.required<HouseholdMember>();
  readonly isLastAdmin = input(false);
  readonly isMe = input(false);
  readonly busy = input(false);

  readonly promote = output<void>();
  readonly demote = output<void>();
  readonly remove = output<void>();

  protected readonly open = signal(false);
  protected readonly isDesktop = this.viewport.isDesktop;

  protected readonly ariaLabel = computed(() => `Acciones sobre ${this.member().displayName}`);

  constructor() {
    effect(() => {
      this.viewport.breakpointChanged();
      this.open.set(false);
    });
  }

  protected toggle(): void {
    this.open.update((current) => !current);
  }

  protected run(action: 'promote' | 'demote' | 'remove'): void {
    this.open.set(false);
    if (action === 'promote') {
      this.promote.emit();
    } else if (action === 'demote') {
      this.demote.emit();
    } else {
      this.remove.emit();
    }
  }
}
