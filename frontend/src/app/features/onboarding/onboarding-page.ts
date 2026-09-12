import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { HouseholdApi } from '../../core/household/household.api';
import { HouseholdContextService } from '../../core/household/household-context.service';
import {
  JOIN_CODE_LENGTH,
  JOIN_CODE_PATTERN,
  normalizeJoinCode,
} from '../../core/household/household.models';
import type { HouseholdDetail, ProblemDetailLike } from './onboarding.types';
import { MyJoinRequestsService } from '../../core/household/my-join-requests.service';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { Icon } from '../../shared/ui/icon';
import { Input } from '../../shared/ui/input';
import { JoinCodePanel } from '../household/join-code-panel';

/** Caracteres que el alfabeto excluye porque se confunden al leer o dictar un código. */
const AMBIGUOUS = /[0O1IL]/;

@Component({
  selector: 'app-onboarding-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Card, FormsModule, Icon, Input, JoinCodePanel, RouterLink],
  template: `
    <main class="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-4 py-10">

      @if (created(); as hogar) {
        <!-- ============ HOGAR RECIÉN CREADO ============ -->
        <div class="mx-auto w-full max-w-md">
          <div class="mb-6 flex flex-col items-center text-center">
            <span
              class="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-ok-weak text-ok"
              aria-hidden="true">
              <ui-icon name="check-circle" [size]="26" />
            </span>
            <!-- El título no concuerda con el nombre del hogar a propósito: "Casa Rivas
                 está listo" chirría, y el género de un nombre propio no se puede deducir.
                 Concordando con "hogar", que siempre es masculino, el nombre puede ser
                 cualquiera. -->
            <h1 class="font-display text-[28px] font-semibold leading-tight tracking-tight text-text">
              Tu hogar está listo
            </h1>
            <p class="mt-2 max-w-[38ch] text-[15px] leading-relaxed text-text-muted">
              Creaste <span class="font-medium text-text">{{ hogar.name }}</span> y lo administras.
              Invita a quien vive contigo con este código.
            </p>
          </div>

          <ui-card>
            <app-join-code-panel [code]="hogar.joinCode" [householdName]="hogar.name" />
          </ui-card>

          <div class="mt-5">
            <ui-button variant="primary" [block]="true" (pressed)="enterHousehold(hogar.id)">
              Entrar a {{ hogar.name }}
            </ui-button>
          </div>
        </div>

      } @else {
        <!-- ============ LOS DOS CAMINOS ============ -->
        <header class="mb-8 flex flex-col items-center text-center">
          <span
            class="mb-4 flex h-12 w-12 items-center justify-center rounded-lg
                   bg-accent text-accent-contrast"
            aria-hidden="true">
            <ui-icon name="house" [size]="26" />
          </span>
          <h1 class="font-display text-[28px] font-semibold leading-tight tracking-tight text-text">
            {{ hasHouseholds() ? 'Otro hogar más' : 'Empecemos por tu hogar' }}
          </h1>
          <p class="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-text-muted">
            Un hogar agrupa la despensa, las plantillas y las recetas de quienes viven juntos.
            Crea el tuyo, o entra en uno que ya existe.
          </p>
        </header>

        @if (requestCount() > 0) {
          <a
            routerLink="/onboarding/pending"
            class="mx-auto mb-6 flex min-h-[var(--touch-min)] items-center gap-2 rounded-md
                   border border-border bg-surface-raised px-3 py-2 text-[14px] text-text
                   transition-colors hover:border-border-strong
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <span class="text-text-muted"><ui-icon name="hourglass-medium" [size]="16" /></span>
            <span>
              @if (pendingCount() > 0) {
                {{ pendingCount() === 1
                  ? 'Tienes una solicitud esperando respuesta'
                  : 'Tienes ' + pendingCount() + ' solicitudes esperando respuesta' }}
              } @else {
                Ver tus solicitudes
              }
            </span>
          </a>
        }

        <div class="grid gap-4 md:grid-cols-2">

          <!-- ---- Crear ---- -->
          <ui-card>
            <form class="flex h-full flex-col gap-4" (submit)="createHousehold($event)">
              <div class="flex flex-col gap-1">
                <span class="flex items-center gap-2 text-[15px] font-medium text-text">
                  <span class="text-accent"><ui-icon name="plus" [size]="18" /></span>
                  Crear un hogar
                </span>
                <p class="text-[13px] leading-relaxed text-text-muted">
                  Serás su administrador y podrás invitar a los demás.
                </p>
              </div>

              <ui-input
                label="Nombre del hogar"
                placeholder="Casa Rivas"
                autocomplete="off"
                [(ngModel)]="name"
                name="householdName"
                [error]="nameError()"
                hint="Como lo llamáis entre vosotros." />

              <div class="mt-auto pt-1">
                <ui-button
                  type="submit"
                  variant="primary"
                  [block]="true"
                  [loading]="creating()"
                  [disabled]="joining()">
                  Crear hogar
                </ui-button>
              </div>
            </form>
          </ui-card>

          <!-- ---- Unirse ---- -->
          <ui-card>
            <form class="flex h-full flex-col gap-4" (submit)="requestToJoin($event)">
              <div class="flex flex-col gap-1">
                <span class="flex items-center gap-2 text-[15px] font-medium text-text">
                  <span class="text-accent"><ui-icon name="sign-in" [size]="18" /></span>
                  Unirte a uno
                </span>
                <p class="text-[13px] leading-relaxed text-text-muted">
                  Pide el código a quien ya está dentro.
                </p>
              </div>

              <ui-input
                label="Código de invitación"
                placeholder="K7M2QP9X"
                autocomplete="off"
                inputMode="text"
                [mono]="true"
                name="joinCode"
                [ngModel]="code()"
                (ngModelChange)="onCodeChange($event)"
                [error]="codeError()"
                [hint]="codeHint()" />

              <div class="mt-auto pt-1">
                <ui-button
                  type="submit"
                  variant="primary"
                  [block]="true"
                  [loading]="joining()"
                  [disabled]="!codeIsValid() || creating()">
                  Enviar solicitud
                </ui-button>
              </div>
            </form>
          </ui-card>
        </div>

        @if (hasHouseholds()) {
          <div class="mt-8 text-center">
            <a
              [routerLink]="backLink()"
              class="text-[14px] text-accent underline underline-offset-4
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              Volver a mis hogares
            </a>
          </div>
        }
      }
    </main>
  `,
  styles: `:host { display: block; }`,
})
export class OnboardingPage {
  private readonly api = inject(HouseholdApi);
  private readonly auth = inject(AuthService);
  private readonly context = inject(HouseholdContextService);
  private readonly myRequests = inject(MyJoinRequestsService);
  private readonly router = inject(Router);

  protected name = '';

  protected readonly code = signal('');
  protected readonly creating = signal(false);
  protected readonly joining = signal(false);
  protected readonly nameError = signal('');
  protected readonly codeError = signal('');

  /** El hogar recién creado. Mientras exista, la pantalla enseña su código. */
  protected readonly created = signal<HouseholdDetail | null>(null);

  protected readonly hasHouseholds = this.context.hasHouseholds;
  protected readonly pendingCount = computed(() => this.myRequests.pending().length);

  /**
   * Cuántas solicitudes hay en total, de cualquier estado. El enlace a la sala de espera
   * se muestra por esto y no sólo por las pendientes: quien ya recibió respuesta también
   * tiene algo que consultar ahí, y con la condición anterior esa pantalla no tenía
   * ningún camino que llevara a ella.
   */
  protected readonly requestCount = computed(() => this.myRequests.requests().length);

  protected readonly codeIsValid = computed(() => JOIN_CODE_PATTERN.test(this.code()));

  constructor() {
    // El arranque sólo carga las solicitudes de quien NO tiene hogares. Quien ya tiene
    // uno y además pidió entrar en otro también necesita ver el enlace a su sala de
    // espera, así que aquí se garantiza que estén cargadas.
    this.myRequests.ensureLoaded().subscribe();
  }

  protected readonly codeHint = computed(() => {
    const written = this.code().length;
    if (written === 0 || this.codeIsValid()) {
      return `${JOIN_CODE_LENGTH} caracteres, sin distinguir mayúsculas.`;
    }
    return `${written} de ${JOIN_CODE_LENGTH} caracteres.`;
  });

  protected backLink(): readonly string[] {
    const id = this.context.startupHouseholdId();
    return id ? ['/h', id, 'pantry'] : ['/'];
  }

  /**
   * Normaliza mientras se escribe —espacios fuera, todo a mayúsculas— y avisa del
   * formato en el acto. Lo que NO hace es borrar en silencio un carácter no permitido:
   * quien teclea una «O» tiene que ver por qué no vale, no que su letra desaparece.
   */
  protected onCodeChange(raw: string): void {
    const normalized = normalizeJoinCode(raw).slice(0, JOIN_CODE_LENGTH);
    this.code.set(normalized);

    if (AMBIGUOUS.test(normalized)) {
      this.codeError.set('El código nunca lleva 0, O, 1, I ni L: se confunden al copiarlo.');
    } else if (normalized.length === JOIN_CODE_LENGTH && !JOIN_CODE_PATTERN.test(normalized)) {
      this.codeError.set('Sólo letras y números.');
    } else {
      this.codeError.set('');
    }
  }

  protected createHousehold(event: Event): void {
    event.preventDefault();
    const name = this.name.trim();

    if (!name) {
      this.nameError.set('Ponle un nombre a tu hogar.');
      return;
    }
    if (name.length > 80) {
      this.nameError.set('Como mucho 80 caracteres.');
      return;
    }

    this.nameError.set('');
    this.creating.set(true);

    // El perfil de la sesión todavía no incluye este hogar, y es de esa lista de la que
    // decide `householdGuard`. Sin recargarlo, entrar al hogar recién creado rebotaría
    // como si fuera ajeno. Por eso el alta y la recarga van encadenadas: cuando la
    // pantalla enseña el código, la aplicación entera ya conoce el hogar.
    let creado: HouseholdDetail | null = null;
    this.api
      .create(name)
      .pipe(
        switchMap((household) => {
          creado = household;
          return this.auth.loadProfile();
        }),
      )
      .subscribe({
        next: () => {
          this.creating.set(false);
          this.created.set(creado);
        },
        error: (error: unknown) => {
          this.creating.set(false);
          if (creado) {
            // El hogar existe; lo que falló fue refrescar el perfil. Se sigue adelante:
            // el guard lo resolverá con la recarga que hace al entrar.
            this.created.set(creado);
            return;
          }
          this.nameError.set(detailOf(error) ?? 'No se pudo crear el hogar. Inténtalo de nuevo.');
        },
      });
  }

  protected requestToJoin(event: Event): void {
    event.preventDefault();
    if (!this.codeIsValid()) {
      this.codeError.set(`El código tiene ${JOIN_CODE_LENGTH} caracteres.`);
      return;
    }

    this.codeError.set('');
    this.joining.set(true);

    this.api.requestToJoin(this.code()).subscribe({
      next: () => {
        this.joining.set(false);
        // Lo cacheado deja de ser cierto, y la sala de espera tiene que ver la nueva.
        this.myRequests.invalidate();
        void this.router.navigate(['/onboarding/pending']);
      },
      error: (error: unknown) => {
        this.joining.set(false);
        this.codeError.set(detailOf(error) ?? 'No se pudo enviar la solicitud.');
      },
    });
  }

  protected enterHousehold(householdId: string): void {
    void this.router.navigate(['/h', householdId, 'pantry']);
  }
}

/**
 * El `detail` del ProblemDetail del backend, que ya viene redactado en español y dice
 * exactamente qué pasó: código desconocido, ya eres miembro, ya tienes una solicitud.
 * Repetirlo aquí en peores palabras sería perder información.
 */
function detailOf(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const body = error.error as ProblemDetailLike | null;
  return typeof body?.detail === 'string' ? body.detail : null;
}
