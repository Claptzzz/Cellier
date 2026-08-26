import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { inject } from '@angular/core';

import { ICON_PATHS, ICON_VIEW_BOX, IconName } from './icon.data';

/**
 * Icono SVG en línea. Los trazados vienen de @phosphor-icons/core mediante
 * scripts/build-icons.mjs; aquí no se dibuja ninguno a mano.
 *
 * Es decorativo por defecto (`aria-hidden`). Cuando el icono ES la etiqueta,
 * pasa `label` y se anuncia como imagen con nombre.
 */
@Component({
  selector: 'ui-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.viewBox]="viewBox"
      [attr.width]="size()"
      [attr.height]="size()"
      [attr.aria-hidden]="label() ? null : 'true'"
      [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label() || null"
      fill="currentColor"
      focusable="false"
      [innerHTML]="body()"></svg>
  `,
  styles: `
    :host { display: inline-flex; flex: none; }
    svg { display: block; }
  `,
})
export class Icon {
  private readonly sanitizer = inject(DomSanitizer);

  readonly name = input.required<IconName>();
  readonly size = input(20);
  /** Texto accesible. Omitir cuando hay una etiqueta visible al lado. */
  readonly label = input<string>('');

  protected readonly viewBox = ICON_VIEW_BOX;

  protected readonly body = computed<SafeHtml>(() =>
    // Contenido estático generado en build desde el paquete de iconos, nunca
    // entrada del usuario.
    this.sanitizer.bypassSecurityTrustHtml(ICON_PATHS[this.name()]),
  );
}
