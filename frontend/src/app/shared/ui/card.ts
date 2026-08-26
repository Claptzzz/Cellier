import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Contenedor elevado. Modelo de estante: nivel 1 es un canto duro de 1px, no una
 * sombra ambiental. En oscuro la sombra no se lee, así que la elevación pasa a
 * expresarse con el salto a --surface-raised y el borde.
 */
@Component({
  selector: 'ui-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div [class]="classes()"><ng-content /></div>`,
  styles: `:host { display: block; }`,
})
export class Card {
  readonly padded = input(true);
  readonly interactive = input(false);

  protected readonly classes = computed(() =>
    [
      'rounded-lg border border-border bg-surface-raised shadow-e1',
      this.padded() ? 'p-4' : '',
      this.interactive()
        ? 'transition-colors duration-150 hover:border-border-strong cursor-pointer'
        : '',
    ].join(' '),
  );
}
