import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface SegmentOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Control segmentado: varias opciones mutuamente excluyentes, siempre visibles, sin el
 * desplegable de un `ui-select`. Pensado para un filtro que se consulta constantemente —tres
 * o cuatro opciones como mucho— donde ocultar las alternativas detrás de un toque obligaría
 * a abrir y cerrar para saber qué más hay.
 *
 * Semántica de grupo de radios: son opciones mutuamente excluyentes, no pestañas que cambian
 * de contenido de página.
 */
@Component({
  selector: 'ui-segmented-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ui-segmented" role="radiogroup" [attr.aria-label]="ariaLabel() || null">
      @for (option of options(); track option.value) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="option.value === value()"
          class="ui-segment"
          [class.ui-segment--active]="option.value === value()"
          (click)="valueChange.emit(option.value)">
          {{ option.label }}
        </button>
      }
    </div>
  `,
  styles: `
    :host { display: block; }

    .ui-segmented {
      display: flex;
      width: 100%;
      gap: 2px;
      padding: 3px;
      border-radius: var(--radius-md);
      background: var(--surface-sunken);
      border: 1px solid var(--border);
    }

    .ui-segment {
      flex: 1 1 0;
      min-width: 0;
      min-height: var(--touch-min);
      border-radius: 7px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding-inline: 0.5rem;
      transition: background-color 150ms, color 150ms, box-shadow 150ms;
    }

    .ui-segment:hover { color: var(--text); }

    .ui-segment:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .ui-segment--active {
      background: var(--surface-raised);
      color: var(--text);
      box-shadow: var(--shadow-e1);
    }
  `,
})
export class SegmentedControl {
  readonly options = input.required<readonly SegmentOption[]>();
  readonly value = input.required<string>();
  readonly ariaLabel = input('');
  readonly valueChange = output<string>();
}
