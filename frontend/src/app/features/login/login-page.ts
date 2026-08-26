import { ChangeDetectionStrategy, Component, ElementRef, OnInit, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme/theme.service';
import { ToastService } from '../../core/toast/toast.service';
import { Icon } from '../../shared/ui/icon';
import { environment } from '../../../environments/environment';
import { loadGoogleIdentity, type GoogleCredentialResponse } from './google-identity';

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <main class="flex min-h-dvh flex-col items-center justify-center bg-surface px-6 py-10">
      <div class="w-full max-w-[380px]">

        <div class="mb-8 flex flex-col items-center text-center">
          <span
            class="mb-4 flex h-12 w-12 items-center justify-center rounded-lg
                   bg-accent text-accent-contrast"
            aria-hidden="true">
            <ui-icon name="package" [size]="26" />
          </span>

          <h1 class="font-display text-[32px] font-semibold leading-tight tracking-tight text-text">
            Cellier
          </h1>
          <p class="mt-2 max-w-[30ch] text-[15px] leading-relaxed text-text-muted">
            La despensa compartida de tu hogar. Qué hay, cuánto queda y qué está por vencer.
          </p>
        </div>

        <div class="rounded-lg border border-border bg-surface-raised p-5 shadow-e1">
          <h2 class="mb-4 text-[15px] font-medium text-text">Inicia sesión para continuar</h2>

          <!-- Contenedor que rellena Google con su propio botón. Se oculta si GIS
               no llegó a cargar, para no dejar un hueco vacío sobre el error. -->
          <div
            #googleButton
            class="flex justify-center"
            [class.min-h-\[44px\]]="status() !== 'error'"
            [class.hidden]="status() === 'error'"></div>

          @if (status() === 'loading') {
            <p class="mt-3 text-center text-[13px] text-text-muted">Cargando Google...</p>
          }

          @if (status() === 'error') {
            <div class="mt-3 rounded-sm border border-danger bg-danger-weak p-3">
              <p class="text-[13px] text-danger">{{ errorMessage() }}</p>
            </div>
          }

          @if (status() === 'submitting') {
            <p class="mt-3 text-center text-[13px] text-text-muted" role="status">
              Verificando tu cuenta...
            </p>
          }
        </div>

        <p class="mt-6 text-center text-[13px] leading-relaxed text-text-muted">
          Cellier no publica nada en tu cuenta. Sólo usamos tu nombre, correo y foto
          para identificarte dentro del hogar.
        </p>
      </div>
    </main>
  `,
  styles: `:host { display: block; }`,
})
export class LoginPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly theme = inject(ThemeService);

  private readonly googleButton = viewChild.required<ElementRef<HTMLElement>>('googleButton');

  protected readonly status = signal<'loading' | 'ready' | 'submitting' | 'error'>('loading');
  protected readonly errorMessage = signal('');

  async ngOnInit(): Promise<void> {
    if (!environment.googleClientId) {
      this.status.set('error');
      this.errorMessage.set(
        'Falta configurar el client id de Google. Define googleClientId en environment.ts.',
      );
      return;
    }

    try {
      const google = await loadGoogleIdentity();

      google.accounts.id.initialize({
        client_id: environment.googleClientId,
        callback: (response) => this.onCredential(response),
        cancel_on_tap_outside: true,
      });

      // GIS pide el ancho en píxeles, no acepta 100%. Se mide el contenedor real
      // para que el botón no se desborde del padding de la tarjeta en 375px.
      const host = this.googleButton().nativeElement;
      const width = Math.min(400, Math.max(200, Math.floor(host.clientWidth || 280)));

      google.accounts.id.renderButton(host, {
        type: 'standard',
        theme: this.theme.isDark() ? 'filled_black' : 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        locale: 'es',
        width,
      });

      this.status.set('ready');
    } catch {
      this.status.set('error');
      this.errorMessage.set(
        'No se pudo cargar el inicio de sesión de Google. Revisa tu conexión e inténtalo de nuevo.',
      );
    }
  }

  private onCredential(response: GoogleCredentialResponse): void {
    this.status.set('submitting');

    this.auth.loginWithGoogle(response.credential).subscribe({
      next: () => {
        const redirect = this.route.snapshot.queryParamMap.get('redirect');
        void this.router.navigateByUrl(redirect && redirect !== '/login' ? redirect : '/pantry');
      },
      error: () => {
        // errorInterceptor ya mostró el detalle. Aquí sólo se recupera la vista.
        this.status.set('ready');
        this.toast.error('No pudimos iniciar tu sesión', 'Inténtalo de nuevo.');
      },
    });
  }
}
