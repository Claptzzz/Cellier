import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { ToastService } from '../../core/toast/toast.service';
import { Button } from '../../shared/ui/button';
import { Icon } from '../../shared/ui/icon';

/**
 * El código de invitación de un hogar, listo para pasárselo a alguien.
 *
 * <p>El código se muestra en Geist Mono y espaciado: es un dato que se dicta y se teclea
 * carácter a carácter, y ahí la anchura fija hace el trabajo que hace con las cantidades.
 * Su alfabeto ya evita 0, O, 1, I y L por el mismo motivo.
 *
 * <p>Copiar está siempre; compartir sólo aparece donde el sistema lo ofrece. Esa es la
 * degradación: no hay dos caminos que puedan fallar, hay uno que siempre está y otro que
 * se suma cuando existe.
 */
@Component({
  selector: 'app-join-code-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Icon],
  template: `
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-1">
        <p class="text-[13px] font-medium text-text">Código de invitación</p>
        <p class="text-[13px] leading-relaxed text-text-muted">
          Quien lo use no entra directamente: te llegará una solicitud que tendrás que aceptar.
        </p>
      </div>

      <div
        class="flex items-center justify-center rounded-md border border-border
               bg-surface-sunken px-4 py-3">
        <!-- aria-label lo deletrea: leído de corrido, un código de ocho caracteres es
             ruido para un lector de pantalla. -->
        <code
          class="font-mono text-[22px] font-medium tracking-[0.18em] text-text"
          [attr.aria-label]="'Código de invitación: ' + spelled()">
          {{ code() }}
        </code>
      </div>

      <div class="flex flex-wrap gap-2">
        <ui-button
          variant="secondary"
          [icon]="copied() ? 'check' : 'copy'"
          [block]="!canShare()"
          (pressed)="copy()">
          {{ copied() ? 'Copiado' : 'Copiar código' }}
        </ui-button>

        @if (canShare()) {
          <ui-button variant="secondary" icon="share-network" (pressed)="share()">
            Compartir
          </ui-button>
        }
      </div>

      <!-- Respaldo para cuando el portapapeles no está disponible: sin HTTPS el
           navegador no lo expone, y entonces la única salida es teclearlo. -->
      @if (copyFailed()) {
        <p class="flex items-start gap-1.5 text-[13px] text-text-muted" role="status">
          <span class="mt-0.5 flex-none text-warn"><ui-icon name="warning" [size]="14" /></span>
          <span>Tu navegador no dejó copiar. Selecciona el código y cópialo a mano.</span>
        </p>
      }
    </div>
  `,
  styles: `:host { display: block; }`,
})
export class JoinCodePanel {
  private readonly toast = inject(ToastService);

  readonly code = input.required<string>();

  /** Nombre del hogar, para que el mensaje que se comparte diga a dónde invita. */
  readonly householdName = input('');

  protected readonly copied = signal(false);
  protected readonly copyFailed = signal(false);

  /** `navigator.share` sólo existe en parte de los navegadores; sobre todo en móvil. */
  protected readonly canShare = signal(typeof navigator !== 'undefined' && 'share' in navigator);

  protected readonly spelled = computed(() => this.code().split('').join(' '));

  protected async copy(): Promise<void> {
    this.copyFailed.set(false);
    try {
      await navigator.clipboard.writeText(this.code());
      this.copied.set(true);
      // Vuelve a "Copiar código" para que se pueda copiar otra vez sin recargar.
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.copyFailed.set(true);
    }
  }

  protected async share(): Promise<void> {
    const destino = this.householdName() ? ` a ${this.householdName()}` : '';
    try {
      await navigator.share({
        title: 'Únete a mi hogar en Cellier',
        text: `Entra${destino} en Cellier con el código ${this.code()}`,
      });
    } catch (error) {
      // Cancelar el diálogo del sistema lanza AbortError y no es un fallo: avisar de
      // ello sería regañar al usuario por cambiar de opinión.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      this.toast.error('No se pudo compartir', 'Copia el código y pásalo tú.');
    }
  }
}
