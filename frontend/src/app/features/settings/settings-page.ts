import { HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { HouseholdApi } from '../../core/household/household.api';
import { HouseholdContextService } from '../../core/household/household-context.service';
import type { HouseholdSummary } from '../../core/household/household.models';
import type { AccountThemePreference, ThemeMode } from '../../core/theme/theme.service';
import { ThemeService } from '../../core/theme/theme.service';
import { ToastService } from '../../core/toast/toast.service';
import { environment } from '../../../environments/environment';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { Dialog } from '../../shared/ui/dialog';
import { Input } from '../../shared/ui/input';
import { SegmentedControl } from '../../shared/ui/segmented-control';
import type { SegmentOption } from '../../shared/ui/segmented-control';

/** Un hogar donde la baja de cuenta quedó bloqueada por ser el único administrador. */
interface BlockingHousehold {
  readonly id: string;
  readonly name: string;
}

/** Lo que se está confirmando. Nombra siempre a quién o a qué afecta. */
type Confirmacion =
  | { readonly tipo: 'salir'; readonly household: HouseholdSummary }
  | { readonly tipo: 'eliminarCuenta' };

const THEME_OPTIONS: readonly SegmentOption[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Sistema' },
];

const TO_ACCOUNT_PREFERENCE: Record<ThemeMode, AccountThemePreference> = {
  light: 'LIGHT',
  dark: 'DARK',
  system: 'SYSTEM',
};

const DELETE_CONFIRMATION_WORD = 'ELIMINAR';

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Card, Dialog, FormsModule, Input, SegmentedControl],
  template: `
    <div class="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-4">

      <!-- ============ PERFIL ============ -->
      <section aria-labelledby="titulo-perfil">
        <h2 id="titulo-perfil" class="mb-3 font-display text-[20px] font-semibold tracking-tight text-text">
          Perfil
        </h2>
        <ui-card>
          <div class="flex items-center gap-4">
            @if (auth.user()?.avatarUrl; as avatar) {
              <img [src]="avatar" alt="" class="h-14 w-14 flex-none rounded-full object-cover" />
            } @else {
              <span
                class="flex h-14 w-14 flex-none items-center justify-center rounded-full
                       bg-accent-weak text-[18px] font-semibold text-accent"
                aria-hidden="true">
                {{ auth.initials() || 'C' }}
              </span>
            }
            <div class="min-w-0 flex-1">
              <p class="truncate text-[13px] text-text-muted">Correo de Google</p>
              <p class="truncate text-[15px] text-text">{{ auth.user()?.email }}</p>
            </div>
          </div>

          <form class="mt-4 flex flex-col gap-3 border-t border-border pt-4" (ngSubmit)="saveName()">
            <ui-input
              label="Nombre para mostrar"
              name="displayName"
              autocomplete="name"
              [ngModelOptions]="{ standalone: true }"
              [ngModel]="nameDraft()"
              (ngModelChange)="nameDraft.set($event)" />
            <div class="flex justify-end">
              <ui-button type="submit" size="sm" [disabled]="!nameIsDirty()" [loading]="savingName()">
                Guardar
              </ui-button>
            </div>
          </form>
        </ui-card>
      </section>

      <!-- ============ APARIENCIA ============ -->
      <section aria-labelledby="titulo-apariencia">
        <h2 id="titulo-apariencia" class="mb-3 font-display text-[20px] font-semibold tracking-tight text-text">
          Apariencia
        </h2>
        <ui-card>
          <ui-segmented-control
            ariaLabel="Tema de la interfaz"
            [options]="themeOptions"
            [value]="theme.mode()"
            (valueChange)="setTheme($event)" />
          <p class="mt-2 text-[13px] text-text-muted">
            @if (savingTheme()) {
              Guardando…
            } @else {
              Se aplica al momento y se recuerda también en tus otros dispositivos.
            }
          </p>
        </ui-card>
      </section>

      <!-- ============ MIS HOGARES ============ -->
      <section aria-labelledby="titulo-hogares">
        <h2 id="titulo-hogares" class="mb-3 font-display text-[20px] font-semibold tracking-tight text-text">
          Mis hogares
        </h2>

        @if (households().length === 0) {
          <ui-card>
            <p class="text-[15px] text-text-muted">Todavía no perteneces a ningún hogar.</p>
          </ui-card>
        } @else {
          <ui-card [padded]="false">
            <ul class="divide-y divide-border">
              @for (household of households(); track household.id) {
                <li class="flex flex-wrap items-center gap-3 p-4">
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-[15px] font-medium text-text">{{ household.name }}</p>
                    <p class="text-[13px] text-text-muted">
                      {{ household.role === 'ADMIN' ? 'Administras' : 'Miembro' }}
                      · {{ household.memberCount }}
                      {{ household.memberCount === 1 ? 'persona' : 'personas' }}
                    </p>
                  </div>

                  <div class="flex flex-none flex-wrap gap-2">
                    @if (household.role === 'ADMIN') {
                      <ui-button
                        variant="secondary"
                        size="sm"
                        [link]="['/h', household.id, 'manage']">
                        Administrar
                      </ui-button>
                    }
                    <ui-button
                      variant="ghost"
                      size="sm"
                      [disabled]="leavingBusy() !== null"
                      (pressed)="askToLeave(household)">
                      Salir del hogar
                    </ui-button>
                  </div>
                </li>
              }
            </ul>
          </ui-card>
        }
      </section>

      <!-- ============ CUENTA ============ -->
      <section aria-labelledby="titulo-cuenta">
        <h2 id="titulo-cuenta" class="mb-3 font-display text-[20px] font-semibold tracking-tight text-text">
          Cuenta
        </h2>
        <ui-card>
          <div class="flex flex-col gap-2">
            <ui-button variant="secondary" icon="sign-out" [block]="true" (pressed)="signOut()">
              Cerrar sesión
            </ui-button>
            <ui-button
              variant="secondary"
              [block]="true"
              [loading]="exporting()"
              (pressed)="downloadData()">
              Descargar mis datos
            </ui-button>
            <ui-button variant="danger" icon="trash" [block]="true" (pressed)="askToDeleteAccount()">
              Eliminar cuenta
            </ui-button>
          </div>
        </ui-card>
      </section>

      <!-- ============ ACERCA DE ============ -->
      <section aria-labelledby="titulo-acerca">
        <h2 id="titulo-acerca" class="mb-3 font-display text-[20px] font-semibold tracking-tight text-text">
          Acerca de
        </h2>
        <ui-card>
          <p class="text-[15px] text-text">Cellier</p>
          <p class="text-[13px] text-text-muted">Compilación {{ buildStamp }}</p>
          <a
            href="/swagger-ui.html"
            target="_blank"
            rel="noopener"
            class="mt-2 inline-block text-[13px] font-medium text-accent underline underline-offset-2">
            Documentación de la API (Swagger)
          </a>
        </ui-card>
      </section>
    </div>

    <!-- ============ CONFIRMACIÓN: SALIR DE UN HOGAR ============ -->
    <ui-dialog
      [open]="confirming()?.tipo === 'salir'"
      [title]="'Salir de ' + (leavingHouseholdName() ?? 'este hogar')"
      (closed)="confirming.set(null)">
      <p class="text-[15px] leading-relaxed text-text">
        Dejarás de ver la despensa, las plantillas y las recetas de este hogar. Para volver
        tendrás que pedir el código y esperar a que te acepten.
      </p>
      @if (leavingIsAdmin()) {
        <p class="mt-2 text-[15px] leading-relaxed text-text">
          Administras este hogar: si eres su único administrador, el hogar debe conservar al
          menos uno y no podrás salir hasta traspasar la administración a otro miembro o
          eliminar el hogar.
        </p>
      }
      <div slot="footer" class="flex gap-2">
        <ui-button variant="secondary" (pressed)="confirming.set(null)">Cancelar</ui-button>
        <ui-button variant="danger" [loading]="leavingBusy() !== null" (pressed)="confirmLeave()">
          Sí, salir del hogar
        </ui-button>
      </div>
    </ui-dialog>

    <!-- ============ CONFIRMACIÓN: ELIMINAR CUENTA ============ -->
    <ui-dialog
      [open]="confirming()?.tipo === 'eliminarCuenta' || blockingHouseholds() !== null"
      [title]="blockingHouseholds() !== null ? 'Todavía no puedes eliminar tu cuenta' : 'Eliminar tu cuenta'"
      (closed)="closeDeleteDialog()">
      @if (blockingHouseholds(); as bloqueantes) {
        <p class="text-[15px] leading-relaxed text-text">
          Eres el único administrador de
          {{ bloqueantes.length === 1 ? 'este hogar' : 'estos hogares' }}. Traspasa la
          administración a otro miembro o elimínalo, y vuelve a intentarlo.
        </p>
        <ul class="mt-3 flex flex-col gap-2">
          @for (hogar of bloqueantes; track hogar.id) {
            <li class="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <span class="truncate text-[15px] text-text">{{ hogar.name }}</span>
              <ui-button
                variant="secondary"
                size="sm"
                [link]="['/h', hogar.id, 'manage']">
                Ir al hogar
              </ui-button>
            </li>
          }
        </ul>
      } @else {
        <p class="text-[15px] leading-relaxed text-text">
          Se anonimizan tu correo y tu nombre, se cierran todas tus sesiones y sales de todos
          tus hogares. No hay vuelta atrás.
        </p>
        <div class="mt-4">
          <ui-input
            label="Escribe ELIMINAR para confirmar"
            name="confirmarEliminar"
            autocomplete="off"
            [ngModelOptions]="{ standalone: true }"
            [ngModel]="deleteConfirmText()"
            (ngModelChange)="deleteConfirmText.set($event)" />
        </div>
      }

      @if (blockingHouseholds() !== null) {
        <div slot="footer" class="flex gap-2">
          <ui-button variant="secondary" (pressed)="closeDeleteDialog()">Cerrar</ui-button>
        </div>
      } @else {
        <div slot="footer" class="flex gap-2">
          <ui-button variant="secondary" (pressed)="closeDeleteDialog()">Cancelar</ui-button>
          <ui-button
            variant="danger"
            [disabled]="!deleteConfirmMatches()"
            [loading]="deletingAccount()"
            (pressed)="confirmDeleteAccount()">
            Sí, eliminar mi cuenta
          </ui-button>
        </div>
      }
    </ui-dialog>
  `,
  styles: `:host { display: block; }`,
})
export class SettingsPage {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly context = inject(HouseholdContextService);
  private readonly householdApi = inject(HouseholdApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  protected readonly themeOptions = THEME_OPTIONS;
  protected readonly buildStamp = environment.buildStamp;

  protected readonly households = this.context.households;

  // -- Perfil ---------------------------------------------------------------

  // El perfil ya está cargado cuando esta página monta: el guard de autenticación
  // lo garantiza. Partir del valor actual evita un effect sólo para sembrar el campo.
  protected readonly nameDraft = signal(this.auth.user()?.displayName ?? '');
  protected readonly savingName = signal(false);

  protected readonly nameIsDirty = computed(() => {
    const draft = this.nameDraft().trim();
    return draft.length > 0 && draft !== (this.auth.user()?.displayName ?? '');
  });

  protected saveName(): void {
    if (!this.nameIsDirty()) {
      return;
    }
    const displayName = this.nameDraft().trim();
    this.savingName.set(true);
    this.auth.updateProfile({ displayName }).subscribe({
      next: () => {
        this.savingName.set(false);
        this.toast.success('Nombre actualizado');
      },
      error: () => this.savingName.set(false),
    });
  }

  // -- Apariencia -------------------------------------------------------------

  protected readonly savingTheme = signal(false);

  protected setTheme(value: string): void {
    const mode = value as ThemeMode;
    this.theme.set(mode); // vista previa inmediata
    this.savingTheme.set(true);
    this.auth.updateProfile({ themePreference: TO_ACCOUNT_PREFERENCE[mode] }).subscribe({
      next: () => this.savingTheme.set(false),
      error: () => this.savingTheme.set(false),
    });
  }

  // -- Mis hogares --------------------------------------------------------------

  protected readonly confirming = signal<Confirmacion | null>(null);
  protected readonly leavingBusy = signal<string | null>(null);

  protected readonly leavingHouseholdName = computed(() => {
    const actual = this.confirming();
    return actual?.tipo === 'salir' ? actual.household.name : null;
  });

  protected readonly leavingIsAdmin = computed(() => {
    const actual = this.confirming();
    return actual?.tipo === 'salir' && actual.household.role === 'ADMIN';
  });

  protected askToLeave(household: HouseholdSummary): void {
    this.confirming.set({ tipo: 'salir', household });
  }

  protected confirmLeave(): void {
    const actual = this.confirming();
    if (actual?.tipo !== 'salir') {
      return;
    }
    const household = actual.household;
    const myUserId = this.auth.user()?.id;
    if (!myUserId) {
      return;
    }

    this.leavingBusy.set(household.id);
    this.householdApi.removeMember(household.id, myUserId).subscribe({
      next: () => {
        this.leavingBusy.set(null);
        this.confirming.set(null);
        this.toast.success(`Saliste de ${household.name}`);
        this.auth.loadProfile().subscribe({ next: () => {}, error: () => {} });
      },
      error: (error: unknown) => {
        this.leavingBusy.set(null);
        this.confirming.set(null);
        this.toast.error(`No se pudo salir de ${household.name}`, detailOf(error) ?? 'Vuelve a intentarlo.');
      },
    });
  }

  // -- Cuenta ---------------------------------------------------------------

  protected readonly exporting = signal(false);

  protected signOut(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }

  protected downloadData(): void {
    this.exporting.set(true);
    this.auth.exportData().subscribe({
      next: (data) => {
        this.exporting.set(false);
        this.triggerJsonDownload(data, 'cellier-datos.json');
      },
      error: () => this.exporting.set(false),
    });
  }

  private triggerJsonDownload(data: unknown, filename: string): void {
    const window = this.document.defaultView;
    if (!window) {
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  // -- Eliminar cuenta --------------------------------------------------------

  protected readonly deleteConfirmText = signal('');
  protected readonly deletingAccount = signal(false);
  protected readonly blockingHouseholds = signal<readonly BlockingHousehold[] | null>(null);

  protected readonly deleteConfirmMatches = computed(
    () => this.deleteConfirmText().trim().toLocaleUpperCase('es-CL') === DELETE_CONFIRMATION_WORD,
  );

  protected askToDeleteAccount(): void {
    this.deleteConfirmText.set('');
    this.confirming.set({ tipo: 'eliminarCuenta' });
  }

  protected closeDeleteDialog(): void {
    this.confirming.set(null);
    this.blockingHouseholds.set(null);
  }

  protected confirmDeleteAccount(): void {
    if (!this.deleteConfirmMatches()) {
      return;
    }
    this.deletingAccount.set(true);
    this.auth.deleteAccount().subscribe({
      next: () => {
        this.deletingAccount.set(false);
        this.toast.success('Cuenta eliminada', 'Esperamos verte de nuevo.');
        void this.router.navigate(['/login']);
      },
      error: (error: unknown) => {
        this.deletingAccount.set(false);
        const bloqueantes = blockingHouseholdsOf(error);
        if (bloqueantes) {
          this.confirming.set(null);
          this.blockingHouseholds.set(bloqueantes);
          return;
        }
        this.confirming.set(null);
        this.toast.error('No se pudo eliminar la cuenta', detailOf(error) ?? 'Vuelve a intentarlo.');
      },
    });
  }
}

/** El `detail` del ProblemDetail del backend, ya redactado y específico. */
function detailOf(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const body = error.error as { detail?: string } | null;
  return typeof body?.detail === 'string' ? body.detail : null;
}

/** La lista de hogares bloqueantes del 409 de `DELETE /api/v1/me`, si el cuerpo la trae. */
function blockingHouseholdsOf(error: unknown): readonly BlockingHousehold[] | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 409) {
    return null;
  }
  const body = error.error as { blockingHouseholds?: unknown } | null;
  const list = body?.blockingHouseholds;
  if (!Array.isArray(list)) {
    return null;
  }
  return list.filter(
    (item): item is BlockingHousehold =>
      typeof item === 'object' && item !== null
      && typeof (item as { id?: unknown }).id === 'string'
      && typeof (item as { name?: unknown }).name === 'string',
  );
}
