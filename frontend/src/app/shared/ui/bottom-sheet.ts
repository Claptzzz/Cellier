import {
  ChangeDetectionStrategy, Component, ElementRef, effect, input, output, viewChild,
} from '@angular/core';

/**
 * Hoja inferior. Es el equivalente móvil del Dialog: mismo <dialog> nativo, pero
 * anclado abajo y a ancho completo, que es donde llega el pulgar.
 *
 * Lleva un asidero visual arriba porque la gente intenta arrastrar estas hojas;
 * el asidero indica que se puede cerrar, aunque el cierre real sea por el botón,
 * por Esc o tocando fuera.
 */
@Component({
  selector: 'ui-bottom-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #sheet class="ui-sheet" (close)="closed.emit()" (cancel)="closed.emit()" (click)="onBackdrop($event)">
      <div class="ui-sheet-panel" (click)="$event.stopPropagation()">
        <div class="flex justify-center pt-3 pb-1">
          <span class="h-1 w-9 rounded-full bg-border-strong" aria-hidden="true"></span>
        </div>

        <h2 class="px-5 pb-3 pt-2 font-display text-[20px] font-semibold tracking-tight text-text">
          {{ title() }}
        </h2>

        <div class="px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          <ng-content />
        </div>
      </div>
    </dialog>
  `,
  styles: `
    :host { display: contents; }

    /*
      SIN position: fixed. Un <dialog> abierto con showModal() vive en el top layer, y
      ahi su bloque contenedor es el viewport. Al forzar position:fixed volvia a buscar bloque
      contenedor entre sus ancestros, y cualquiera con transform, filter o
      backdrop-filter se lo daba: dentro de la cabecera del chasis —que lleva
      backdrop-blur— la hoja se resolvia contra un elemento de 8px de alto y su panel
      terminaba en y = -266, fuera de la pantalla por arriba. El fondo atenuado si se
      pintaba, asi que parecia abierta y no se veia.

      Medido, no supuesto: la sonda esta en la seccion 4 de
      docs/frontend-orden-de-ejecucion.md.
    */
    .ui-sheet {
      padding: 0;
      border: 0;
      background: transparent;
      margin: 0;
      width: 100vw;
      max-width: 100vw;
      height: 100dvh;
      max-height: 100dvh;
    }

    .ui-sheet::backdrop { background: rgb(6 12 18 / 0.55); }

    .ui-sheet-panel {
      position: absolute;
      inset-inline: 0;
      bottom: 0;
      background: var(--surface-raised);
      color: var(--text);
      border-top: 1px solid var(--border);
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      box-shadow: var(--shadow-2);
      max-height: 88dvh;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .ui-sheet[open] .ui-sheet-panel {
      animation: ui-sheet-in 220ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes ui-sheet-in {
      from { transform: translateY(100%); }
      to   { transform: none; }
    }

    @media (prefers-reduced-motion: reduce) {
      .ui-sheet[open] .ui-sheet-panel { animation: none; }
    }
  `,
})
export class BottomSheet {
  readonly open = input(false);
  readonly title = input.required<string>();

  readonly closed = output<void>();

  private readonly sheetRef = viewChild.required<ElementRef<HTMLDialogElement>>('sheet');

  constructor() {
    effect(() => {
      const element = this.sheetRef().nativeElement;
      if (this.open() && !element.open) {
        element.showModal();
      } else if (!this.open() && element.open) {
        element.close();
      }
    });
  }

  /** Tocar fuera del panel cierra. El panel detiene la propagación. */
  protected onBackdrop(_event: MouseEvent): void {
    this.sheetRef().nativeElement.close();
  }
}
