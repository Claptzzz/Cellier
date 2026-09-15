import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ToastService, ToastTone } from '../../core/toast/toast.service';
import { Icon } from './icon';
import type { IconName } from './icon.data';

const TONE_ICON: Record<ToastTone, IconName> = {
  info: 'info',
  ok: 'check',
  warn: 'warning',
  danger: 'warning-circle',
};

const TONE_CLASS: Record<ToastTone, string> = {
  info: 'text-accent',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
};

/**
 * Pila de avisos. Se monta una sola vez en el AppShell.
 *
 * En móvil se apoya arriba y no abajo, para no chocar con la navegación inferior
 * ni con el FAB. `role=status` con `aria-live=polite` anuncia sin interrumpir.
 */
@Component({
  selector: 'ui-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="toast-host" role="status" aria-live="polite" aria-atomic="false">
      @for (toast of toasts(); track toast.id) {
        <div class="toast">
          <span [class]="'mt-0.5 ' + toneClass(toast.tone)">
            <ui-icon [name]="toneIcon(toast.tone)" [size]="18" />
          </span>

          <div class="min-w-0 flex-1">
            <p class="text-[14px] font-medium text-text">{{ toast.title }}</p>
            @if (toast.detail) {
              <p class="mt-0.5 text-[13px] leading-snug text-text-muted">{{ toast.detail }}</p>
            }
          </div>

          @if (toast.action; as action) {
            <!-- La acción va ANTES del aspa y con área táctil propia: deshacer se pulsa con
                 prisa, y tener el descarte al lado invita a cerrar lo que se quería recuperar. -->
            <button
              type="button"
              class="-my-1 flex h-9 flex-none items-center rounded-sm px-3 text-[14px]
                     font-medium text-accent transition-colors hover:bg-surface-sunken
                     focus-visible:outline-2 focus-visible:outline-offset-2
                     focus-visible:outline-accent"
              (click)="toastService.run(toast.id)">
              {{ action.label }}
            </button>
          }

          <button
            type="button"
            class="-m-1.5 flex h-9 w-9 flex-none items-center justify-center rounded-sm
                   text-text-muted transition-colors hover:bg-surface-sunken hover:text-text
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label="Descartar aviso"
            (click)="toastService.dismiss(toast.id)">
            <ui-icon name="x" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toast-host {
      position: fixed;
      z-index: 60;
      top: max(12px, env(safe-area-inset-top));
      left: 12px;
      right: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }

    @media (min-width: 640px) {
      .toast-host { left: auto; width: 380px; right: 16px; top: 16px; }
    }

    .toast {
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      background: var(--surface-raised);
      box-shadow: var(--shadow-2);
      animation: toast-in 180ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes toast-in {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: none; }
    }

    @media (prefers-reduced-motion: reduce) {
      .toast { animation: none; }
    }
  `,
})
export class ToastHost {
  protected readonly toastService = inject(ToastService);
  protected readonly toasts = this.toastService.toasts;

  protected toneIcon(tone: ToastTone): IconName {
    return TONE_ICON[tone];
  }

  protected toneClass(tone: ToastTone): string {
    return TONE_CLASS[tone];
  }
}
