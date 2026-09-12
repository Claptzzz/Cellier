import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';

/**
 * La sesión es válida pero no se pudo hablar con el servidor.
 *
 * <p>Es la salida al caso que antes dejaba la pantalla en blanco: el perfil se carga
 * antes de enrutar y, si esa carga falla, no hay nada que enseñar y tampoco hay motivo
 * para echar a nadie. Aquí se dice qué pasó y se ofrece volver a intentarlo.
 *
 * <p>No lleva guards a propósito. Es el punto de corte del bucle: cualquier redirección
 * que exija el perfil volvería a caer en el mismo sitio.
 */
@Component({
  selector: 'app-reconnect-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, EmptyState],
  template: `
    <div class="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <ui-empty-state
        icon="warning-circle"
        title="No pudimos conectar con el servidor"
        description="Tu sesión sigue abierta. Puede ser tu conexión, o que el servicio esté caído un momento." />

      <ui-button
        variant="primary"
        icon="arrows-clockwise"
        [loading]="retrying()"
        (pressed)="retry()">
        Reintentar
      </ui-button>

      @if (failedAgain()) {
        <p class="text-center text-[13px] text-text-muted" role="status">
          Sigue sin responder. Espera un momento y vuelve a intentarlo.
        </p>
      }
    </div>
  `,
  styles: `:host { display: block; }`,
})
export class ReconnectPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly retrying = signal(false);
  protected readonly failedAgain = signal(false);

  protected retry(): void {
    this.retrying.set(true);
    this.failedAgain.set(false);

    this.auth.retryProfileLoad().subscribe((profile) => {
      this.retrying.set(false);
      if (!profile) {
        this.failedAgain.set(true);
        return;
      }
      // Vuelve a donde iba. El parámetro llega del guard que desvió aquí.
      const target = new URLSearchParams(window.location.search).get('redirect');
      void this.router.navigateByUrl(target && target.startsWith('/') ? target : '/');
    });
  }
}
