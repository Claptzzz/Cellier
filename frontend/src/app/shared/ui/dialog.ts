import {
  ChangeDetectionStrategy, Component, ElementRef, effect, input, output, viewChild,
} from '@angular/core';

import { Icon } from './icon';

/**
 * Diálogo modal sobre <dialog> nativo.
 *
 * Se usa el elemento nativo porque trae gratis lo que se suele implementar mal:
 * atrapado del foco, capa superior real (sin pelear con z-index), cierre con Esc
 * y ::backdrop. Sólo hay que devolver el foco al abrir y avisar del cierre.
 */
@Component({
  selector: 'ui-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <dialog #dlg class="ui-dialog" (close)="closed.emit()" (cancel)="closed.emit()">
      <div class="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <h2 class="font-display text-[20px] font-semibold tracking-tight text-text">
          {{ title() }}
        </h2>
        <button
          type="button"
          class="-m-2 flex h-11 w-11 items-center justify-center rounded-sm text-text-muted
                 transition-colors hover:bg-surface-sunken hover:text-text
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label="Cerrar"
          (click)="close()">
          <ui-icon name="x" [size]="20" />
        </button>
      </div>

      <div class="px-5 py-4"><ng-content /></div>

      <div class="flex justify-end gap-2 border-t border-border px-5 py-4 empty:hidden">
        <ng-content select="[slot=footer]" />
      </div>
    </dialog>
  `,
  styles: `
    :host { display: contents; }

    .ui-dialog {
      padding: 0;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface-raised);
      color: var(--text);
      box-shadow: var(--shadow-2);
      width: min(480px, calc(100vw - 32px));
      max-height: min(640px, calc(100dvh - 64px));
      overflow-y: auto;
      /* Que el scroll del diálogo no arrastre la página de detrás. */
      overscroll-behavior: contain;
    }

    .ui-dialog::backdrop {
      background: rgb(6 12 18 / 0.55);
      backdrop-filter: blur(2px);
    }

    .ui-dialog[open] { animation: ui-dialog-in 160ms cubic-bezier(0.16, 1, 0.3, 1); }

    @keyframes ui-dialog-in {
      from { opacity: 0; transform: translateY(8px) scale(0.98); }
      to   { opacity: 1; transform: none; }
    }

    @media (prefers-reduced-motion: reduce) {
      .ui-dialog[open] { animation: none; }
      .ui-dialog::backdrop { backdrop-filter: none; }
    }
  `,
})
export class Dialog {
  readonly open = input(false);
  readonly title = input.required<string>();

  readonly closed = output<void>();

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const element = this.dialogRef().nativeElement;
      if (this.open() && !element.open) {
        element.showModal();
      } else if (!this.open() && element.open) {
        element.close();
      }
    });
  }

  close(): void {
    this.dialogRef().nativeElement.close();
  }
}
