import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { HouseholdApi } from '../../core/household/household.api';
import { HouseholdContextService } from '../../core/household/household-context.service';
import type {
  HouseholdDetail,
  HouseholdMember,
  JoinRequest,
} from '../../core/household/household.models';
import { PendingApprovalsService } from '../../core/household/pending-approvals.service';
import { ToastService } from '../../core/toast/toast.service';
import { Button } from '../../shared/ui/button';
import { Card } from '../../shared/ui/card';
import { Dialog } from '../../shared/ui/dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { Skeleton } from '../../shared/ui/skeleton';
import { JoinCodePanel } from './join-code-panel';
import { MemberAvatar } from './member-avatar';
import { MemberRow } from './member-row';

/** Lo que se está confirmando. Nombra siempre a quién o a qué afecta. */
type Confirmacion =
  | { readonly tipo: 'expulsar'; readonly member: HouseholdMember }
  | { readonly tipo: 'salir'; readonly member: HouseholdMember }
  | { readonly tipo: 'regenerar' };

@Component({
  selector: 'app-manage-household-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Button, Card, DatePipe, Dialog, EmptyState, Icon,
    JoinCodePanel, MemberAvatar, MemberRow, Skeleton,
  ],
  template: `
    <div class="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-4">

      <!-- ============ SOLICITUDES PENDIENTES ============ -->
      <section aria-labelledby="titulo-solicitudes">
        <h2 id="titulo-solicitudes" class="mb-3 font-display text-[20px] font-semibold tracking-tight text-text">
          Solicitudes
          @if (requests().length > 0) {
            <span class="text-text-muted">({{ requests().length }})</span>
          }
        </h2>

        @if (loadingRequests()) {
          <ui-card>
            <div class="flex flex-col gap-4" aria-busy="true">
              @for (fila of [1, 2]; track fila) {
                <div class="flex items-center gap-3">
                  <ui-skeleton width="40px" height="40px" radius="999px" label="Cargando solicitudes" />
                  <div class="flex flex-1 flex-col gap-1.5">
                    <ui-skeleton width="45%" height="15px" label="" />
                    <ui-skeleton width="60%" height="13px" label="" />
                  </div>
                  <ui-skeleton width="150px" height="44px" radius="10px" label="" />
                </div>
              }
            </div>
          </ui-card>

        } @else if (requests().length === 0) {
          <ui-card>
            <ui-empty-state
              icon="tray"
              title="No hay solicitudes esperando"
              description="Cuando alguien use el código de invitación, su petición aparecerá aquí para que la aceptes." />
          </ui-card>

        } @else {
          <ui-card [padded]="false">
            <ul class="divide-y divide-border">
              @for (request of requests(); track request.id) {
                <li class="flex flex-wrap items-center gap-3 p-4">
                  <app-member-avatar
                    [displayName]="request.displayName"
                    [avatarUrl]="request.avatarUrl" />

                  <div class="min-w-0 flex-1">
                    <p class="truncate text-[15px] font-medium text-text">{{ request.displayName }}</p>
                    <p class="truncate text-[13px] text-text-muted">{{ request.email }}</p>
                    <p class="text-[13px] text-text-muted">
                      Pidió entrar el {{ request.requestedAt | date: 'd MMM, HH:mm' }}
                    </p>
                  </div>

                  <div class="flex flex-none gap-2">
                    <ui-button
                      variant="secondary"
                      icon="prohibit"
                      [disabled]="busy() !== null"
                      (pressed)="reject(request)">
                      Rechazar
                    </ui-button>
                    <ui-button
                      variant="primary"
                      icon="check-circle"
                      [disabled]="busy() !== null"
                      (pressed)="approve(request)">
                      Aceptar
                    </ui-button>
                  </div>
                </li>
              }
            </ul>
          </ui-card>
        }
      </section>

      <!-- ============ MIEMBROS ============ -->
      <section aria-labelledby="titulo-miembros">
        <h2 id="titulo-miembros" class="mb-3 font-display text-[20px] font-semibold tracking-tight text-text">
          Miembros
          @if (members().length > 0) {
            <span class="text-text-muted">({{ members().length }})</span>
          }
        </h2>

        @if (loadingMembers()) {
          <ui-card>
            <div class="flex flex-col gap-4" aria-busy="true">
              @for (fila of [1, 2, 3]; track fila) {
                <div class="flex items-center gap-3">
                  <ui-skeleton width="40px" height="40px" radius="999px" label="Cargando miembros" />
                  <div class="flex flex-1 flex-col gap-1.5">
                    <ui-skeleton width="40%" height="15px" label="" />
                    <ui-skeleton width="55%" height="13px" label="" />
                  </div>
                </div>
              }
            </div>
          </ui-card>

        } @else {
          <ui-card [padded]="false">
            <ul class="divide-y divide-border p-2">
              @for (member of members(); track member.userId) {
                <li>
                  <app-member-row
                    [member]="member"
                    [isMe]="member.userId === myUserId()"
                    [isLastAdmin]="isLastAdmin(member)"
                    [busy]="busy() === member.userId"
                    (promote)="changeRole(member, 'ADMIN')"
                    (demote)="changeRole(member, 'MEMBER')"
                    (remove)="askToRemove(member)" />
                </li>
              }
            </ul>

            @if (members().length === 1) {
              <!-- Un hogar de una sola persona no está roto, está empezando. -->
              <div class="border-t border-border px-4 py-5 text-center">
                <p class="text-[15px] font-medium text-text">De momento estás tú sola o solo aquí</p>
                <p class="mx-auto mt-1 max-w-[42ch] text-[14px] leading-relaxed text-text-muted">
                  Pasa el código de invitación a quien vive contigo y acepta su solicitud
                  cuando llegue.
                </p>
              </div>
            }
          </ui-card>
        }
      </section>

      <!-- ============ CÓDIGO DE INVITACIÓN ============ -->
      <section aria-labelledby="titulo-codigo">
        <h2 id="titulo-codigo" class="mb-3 font-display text-[20px] font-semibold tracking-tight text-text">
          Invitar
        </h2>

        <ui-card>
          @if (detail(); as hogar) {
            <div class="flex flex-col gap-4">
              <app-join-code-panel [code]="hogar.joinCode" [householdName]="hogar.name" />

              <div class="border-t border-border pt-4">
                <ui-button
                  variant="secondary"
                  icon="arrows-clockwise"
                  [loading]="regenerating()"
                  (pressed)="askToRegenerate()">
                  Generar un código nuevo
                </ui-button>
                <p class="mt-2 flex items-start gap-1.5 text-[13px] leading-relaxed text-text-muted">
                  <span class="mt-0.5 flex-none text-warn"><ui-icon name="warning" [size]="14" /></span>
                  <span>El código actual dejará de funcionar en cuanto generes uno nuevo.</span>
                </p>
              </div>
            </div>
          } @else {
            <div class="flex flex-col gap-3" aria-busy="true">
              <ui-skeleton width="40%" height="15px" label="Cargando el código de invitación" />
              <ui-skeleton width="100%" height="56px" radius="10px" label="" />
              <ui-skeleton width="160px" height="44px" radius="10px" label="" />
            </div>
          }
        </ui-card>
      </section>
    </div>

    <!-- ============ CONFIRMACIÓN ============ -->
    <!-- Nombra siempre a quién afecta. Un "¿estás seguro?" genérico se despacha por
         reflejo, y entonces deja de proteger justo en la vez que importaba. -->
    <ui-dialog
      [open]="confirming() !== null"
      [title]="confirmTitle()"
      (closed)="confirming.set(null)">
      <p class="text-[15px] leading-relaxed text-text">{{ confirmBody() }}</p>

      <div slot="footer" class="flex gap-2">
        <ui-button variant="secondary" (pressed)="confirming.set(null)">Cancelar</ui-button>
        <ui-button variant="danger" (pressed)="confirm()">{{ confirmAction() }}</ui-button>
      </div>
    </ui-dialog>
  `,
  styles: `:host { display: block; }`,
})
export class ManageHouseholdPage {
  private readonly api = inject(HouseholdApi);
  private readonly context = inject(HouseholdContextService);
  private readonly auth = inject(AuthService);
  private readonly pending = inject(PendingApprovalsService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly requests = signal<readonly JoinRequest[]>([]);
  protected readonly members = signal<readonly HouseholdMember[]>([]);
  protected readonly detail = signal<HouseholdDetail | null>(null);

  protected readonly loadingRequests = signal(true);
  protected readonly loadingMembers = signal(true);
  protected readonly regenerating = signal(false);

  /** Sobre quién hay una operación en vuelo, para no encadenar dos a la vez. */
  protected readonly busy = signal<string | null>(null);

  protected readonly confirming = signal<Confirmacion | null>(null);

  protected readonly myUserId = computed(() => this.auth.user()?.id ?? null);

  private readonly adminCount = computed(
    () => this.members().filter((member) => member.role === 'ADMIN').length,
  );

  constructor() {
    effect(() => {
      const householdId = this.context.householdId();
      if (householdId) {
        this.loadAll(householdId);
      }
    });
  }

  /**
   * Si esta persona es el último administrador. La interfaz lo sabe contando, así que
   * puede deshabilitar la acción y explicar el motivo **antes** de que alguien la pulse.
   * El servidor lo impide igualmente con un 409; esto evita que enterarse cueste un error.
   */
  protected isLastAdmin(member: HouseholdMember): boolean {
    return member.role === 'ADMIN' && this.adminCount() === 1;
  }

  // -- Solicitudes ---------------------------------------------------------

  protected approve(request: JoinRequest): void {
    this.resolve(request, 'aprobar');
  }

  protected reject(request: JoinRequest): void {
    this.resolve(request, 'rechazar');
  }

  /**
   * Quita la fila en el acto y la devuelve si el servidor dice que no.
   *
   * <p>Aprobar es un gesto que se repite: hay varias solicitudes y se resuelven seguidas.
   * Esperar la respuesta entre una y otra convierte una tarea de diez segundos en una de
   * un minuto. El precio es tener que deshacer, y por eso se guarda la lista anterior
   * entera en vez de reinsertar la fila donde se cree que estaba.
   */
  private resolve(request: JoinRequest, accion: 'aprobar' | 'rechazar'): void {
    const householdId = this.context.householdId();
    if (!householdId || this.busy()) {
      return;
    }

    const anterior = this.requests();
    this.requests.update((list) => list.filter((candidate) => candidate.id !== request.id));
    this.busy.set(request.id);

    const peticion =
      accion === 'aprobar'
        ? this.api.approve(householdId, request.id)
        : this.api.reject(householdId, request.id);

    peticion.subscribe({
      next: () => {
        this.busy.set(null);
        this.pending.refresh();
        if (accion === 'aprobar') {
          this.toast.success(`${request.displayName} ya está en el hogar`);
          // La persona entra: la lista de miembros y el recuento del perfil cambiaron.
          this.loadMembers(householdId);
          this.auth.loadProfile().subscribe({ next: () => {}, error: () => {} });
        }
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.requests.set(anterior);
        this.toast.error(
          `No se pudo ${accion} la solicitud de ${request.displayName}`,
          detailOf(error) ?? 'Vuelve a intentarlo.',
        );
        // Un 409 suele significar que otra persona la resolvió antes: lo que se muestra
        // ya no es cierto y hay que releerlo.
        this.loadRequests(householdId);
      },
    });
  }

  // -- Roles ---------------------------------------------------------------

  protected changeRole(member: HouseholdMember, role: 'ADMIN' | 'MEMBER'): void {
    const householdId = this.context.householdId();
    if (!householdId || this.busy()) {
      return;
    }

    const anterior = this.members();
    this.members.update((list) =>
      list.map((candidate) => (candidate.userId === member.userId ? { ...candidate, role } : candidate)),
    );
    this.busy.set(member.userId);

    this.api.changeRole(householdId, member.userId, role).subscribe({
      next: (actualizado) => {
        this.busy.set(null);
        this.members.update((list) =>
          list.map((candidate) => (candidate.userId === member.userId ? actualizado : candidate)),
        );
        this.toast.success(
          role === 'ADMIN'
            ? `${member.displayName} ya administra el hogar`
            : `${member.displayName} ya no administra el hogar`,
        );
        // Si el rol que cambió es el propio, el perfil de la sesión quedó obsoleto y con
        // él lo que la navegación deja ver.
        if (member.userId === this.myUserId()) {
          this.auth.loadProfile().subscribe({ next: () => {}, error: () => {} });
        }
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.members.set(anterior);
        this.toast.error(
          `No se pudo cambiar el rol de ${member.displayName}`,
          detailOf(error) ?? 'Vuelve a intentarlo.',
        );
      },
    });
  }

  // -- Confirmaciones ------------------------------------------------------

  protected askToRemove(member: HouseholdMember): void {
    this.confirming.set(
      member.userId === this.myUserId()
        ? { tipo: 'salir', member }
        : { tipo: 'expulsar', member },
    );
  }

  protected askToRegenerate(): void {
    this.confirming.set({ tipo: 'regenerar' });
  }

  protected readonly confirmTitle = computed(() => {
    const actual = this.confirming();
    if (!actual) {
      return '';
    }
    if (actual.tipo === 'regenerar') {
      return 'Generar un código nuevo';
    }
    // El verbo no concuerda con el nombre, así que la persona puede ir en el título.
    return actual.tipo === 'salir'
      ? `Salir de ${this.detail()?.name ?? 'este hogar'}`
      : `Expulsar a ${actual.member.displayName} del hogar`;
  });

  protected readonly confirmBody = computed(() => {
    const actual = this.confirming();
    if (!actual) {
      return '';
    }
    if (actual.tipo === 'regenerar') {
      return 'El código actual dejará de funcionar. Quien lo tenga apuntado no podrá usarlo, '
        + 'y tendrás que pasar el nuevo. Las solicitudes ya enviadas siguen esperando tu respuesta.';
    }
    if (actual.tipo === 'salir') {
      return 'Dejarás de ver la despensa, las plantillas y las recetas de este hogar. '
        + 'Para volver tendrás que pedir el código y esperar a que te acepten.';
    }
    return `${actual.member.displayName} dejará de ver la despensa, las plantillas y las recetas `
      + 'de este hogar. Para volver tendrá que pedir el código y esperar a que la aceptes.';
  });

  protected readonly confirmAction = computed(() => {
    const actual = this.confirming();
    if (!actual) {
      return '';
    }
    if (actual.tipo === 'regenerar') {
      return 'Generar código nuevo';
    }
    return actual.tipo === 'salir' ? 'Salir del hogar' : 'Expulsar';
  });

  protected confirm(): void {
    const actual = this.confirming();
    this.confirming.set(null);
    if (!actual) {
      return;
    }
    if (actual.tipo === 'regenerar') {
      this.regenerate();
    } else {
      this.removeMember(actual.member, actual.tipo === 'salir');
    }
  }

  /**
   * Expulsar NO es optimista, a diferencia de aprobar o cambiar un rol. Quitar a alguien
   * de una lista y volver a ponerlo si falla es exactamente el parpadeo que hace dudar de
   * lo que se acaba de hacer, y aquí no hay ninguna prisa que lo justifique: es una acción
   * única, deliberada y ya confirmada.
   */
  private removeMember(member: HouseholdMember, salgoYo: boolean): void {
    const householdId = this.context.householdId();
    if (!householdId) {
      return;
    }
    this.busy.set(member.userId);

    this.api.removeMember(householdId, member.userId).subscribe({
      next: () => {
        this.busy.set(null);
        if (salgoYo) {
          // Ya no se pertenece a este hogar: quedarse en su pantalla de gestión daría un
          // 404 a la primera acción. El perfil se recarga y el guard decide a dónde ir.
          this.toast.success('Saliste del hogar');
          // El perfil se recarga primero: la raíz decide a qué hogar llevar leyendo la
          // lista, y con la lista vieja mandaría de vuelta al que se acaba de dejar.
          const irAlaRaiz = () => void this.router.navigate(['/']);
          this.auth.loadProfile().subscribe({ next: irAlaRaiz, error: irAlaRaiz });
          return;
        }
        this.toast.success(`${member.displayName} ya no está en el hogar`);
        this.loadMembers(householdId);
        this.auth.loadProfile().subscribe({ next: () => {}, error: () => {} });
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.toast.error(
          salgoYo ? 'No se pudo salir del hogar' : `No se pudo expulsar a ${member.displayName}`,
          detailOf(error) ?? 'Vuelve a intentarlo.',
        );
      },
    });
  }

  private regenerate(): void {
    const householdId = this.context.householdId();
    if (!householdId) {
      return;
    }
    this.regenerating.set(true);

    this.api.regenerateJoinCode(householdId).subscribe({
      next: ({ joinCode }) => {
        this.regenerating.set(false);
        this.detail.update((current) => (current ? { ...current, joinCode } : current));
        this.toast.success('Código nuevo generado', 'El anterior ya no funciona.');
      },
      error: () => this.regenerating.set(false),
    });
  }

  // -- Carga ---------------------------------------------------------------

  private loadAll(householdId: string): void {
    this.loadRequests(householdId);
    this.loadMembers(householdId);

    this.detail.set(null);
    this.api.get(householdId).subscribe({
      next: (detail) => this.detail.set(detail),
      error: () => this.detail.set(null),
    });
  }

  private loadRequests(householdId: string): void {
    this.loadingRequests.set(true);
    this.api.joinRequests(householdId, 'PENDING').subscribe({
      next: (requests) => {
        this.requests.set(requests);
        this.loadingRequests.set(false);
      },
      error: () => {
        this.requests.set([]);
        this.loadingRequests.set(false);
      },
    });
  }

  private loadMembers(householdId: string): void {
    this.loadingMembers.set(true);
    this.api.members(householdId).subscribe({
      next: (members) => {
        this.members.set(members);
        this.loadingMembers.set(false);
      },
      error: () => {
        this.members.set([]);
        this.loadingMembers.set(false);
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
