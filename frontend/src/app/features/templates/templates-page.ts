import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, computed, inject, signal,
} from '@angular/core';
import { forkJoin, of, switchMap } from 'rxjs';

import { HouseholdContextService } from '../../core/household/household-context.service';
import { TemplateApi } from '../../core/templates/template.api';
import { TemplateStore } from '../../core/templates/template-store';
import { ToastService } from '../../core/toast/toast.service';
import type { TemplateSummary } from '../../core/templates/template.models';
import { NgTemplateOutlet } from '@angular/common';
import { ViewportService } from '../../core/layout/viewport.service';
import { BottomSheet } from '../../shared/ui/bottom-sheet';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { IconButton } from '../../shared/ui/icon-button';
import { Menu } from '../../shared/ui/menu';
import { Skeleton } from '../../shared/ui/skeleton';
import { TemplateNameDialog } from './template-name-dialog';
import type { NameIntent } from './template-name-dialog';

/**
 * Las plantillas del hogar.
 *
 * <p>Es una pantalla de elegir, no de trabajar: se entra, se abre una y se sale. Por eso cada
 * fila dice lo justo para decidir —cómo se llama, cuánto tiene y quién la escribió— y todo lo
 * demás vive dentro.
 */
@Component({
  selector: 'app-templates-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BottomSheet, Button, EmptyState, Icon, IconButton, Menu, NgTemplateOutlet, Skeleton,
    TemplateNameDialog,
  ],
  template: `
    <div class="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-4">

      @if (store.loadingFirstTime()) {
        <div class="flex flex-col gap-2" aria-busy="true">
          @for (fila of [1, 2, 3]; track fila) {
            <div class="flex items-center justify-between gap-3 rounded-md border border-border
                        bg-surface-raised p-4">
              <div class="flex w-full max-w-[60%] flex-col gap-2">
                <ui-skeleton width="70%" height="15px" label="Cargando las plantillas" />
                <ui-skeleton width="45%" height="13px" />
              </div>
              <ui-skeleton width="24px" height="24px" radius="999px" />
            </div>
          }
        </div>
      } @else if (store.hasError()) {
        <ui-empty-state
          icon="warning-circle"
          title="No pudimos cargar las plantillas"
          description="Puede ser la conexión. Lo que tengas guardado sigue a salvo.">
          <ui-button icon="arrows-clockwise" (pressed)="store.reload()">Reintentar</ui-button>
        </ui-empty-state>
      } @else if (store.isEmpty()) {
        <!-- El vacío explica para qué sirve con un ejemplo, no con una definición: quien
             llega aquí por primera vez no sabe qué es una plantilla, y «lista de compra
             recurrente» no se lo dice. -->
        <ui-empty-state
          icon="list-checks"
          title="Todavía no tienes plantillas">
          <div class="flex flex-col items-center gap-4">
            <p class="max-w-[46ch] text-[14px] leading-relaxed text-text-muted">
              Una plantilla es lo que quieres tener en casa. Cellier la compara con tu despensa
              y te dice qué falta comprar.
            </p>

            <div class="w-full max-w-[22rem] rounded-md border border-border bg-surface-raised
                        p-4 text-left">
              <p class="mb-2 text-[13px] font-medium text-text">Por ejemplo, «Compra semanal»</p>
              <ul class="flex list-none flex-col gap-1 p-0">
                @for (ejemplo of EJEMPLO; track ejemplo.nombre) {
                  <li class="flex items-baseline justify-between gap-3 text-[14px]">
                    <span class="truncate text-text-muted">{{ ejemplo.nombre }}</span>
                    <span class="flex-none font-mono tabular-nums text-text">
                      {{ ejemplo.cantidad }}
                    </span>
                  </li>
                }
              </ul>
              <p class="mt-3 border-t border-border pt-2 text-[13px] text-text-muted">
                Si en la despensa hay 4 huevos, el reporte dirá <strong class="text-text">faltan
                6</strong>.
              </p>
            </div>

            <ui-button icon="plus" (pressed)="askName('create')">Crear la primera</ui-button>
          </div>
        </ui-empty-state>
      } @else {
        <div class="flex justify-end">
          <ui-button icon="plus" (pressed)="askName('create')">Nueva plantilla</ui-button>
        </div>

        <ul class="flex list-none flex-col gap-2 p-0">
          @for (template of store.templates(); track template.id) {
            <li>
              <div class="flex items-center gap-2 rounded-md border border-border
                          bg-surface-raised pl-4 pr-2 shadow-e1">
                <!-- Todavía NO es un enlace: el editor llega en el PR siguiente, y un enlace
                     a una ruta que no existe acaba en el redirector de rutas desconocidas.
                     Un botón muerto es la versión pequeña de una pantalla huérfana. -->
                <div class="flex min-w-0 flex-1 flex-col gap-1 py-4">
                  <span class="truncate text-[15px] font-medium text-text">{{ template.name }}</span>
                  <span class="truncate text-[13px] text-text-muted">{{ subtitle(template) }}</span>
                </div>

                <!-- En escritorio, panel anclado a la fila. En móvil, hoja inferior: un
                     panel anclado a la última fila de una lista larga acaba abajo del todo,
                     lejos de lo que lo abrió y sin decir sobre qué actúa. -->
                @if (isDesktop()) {
                  <ui-menu
                    [open]="openMenu() === template.id"
                    align="end"
                    [label]="'Acciones sobre ' + template.name"
                    (closed)="openMenu.set(null)">
                    <div class="flex flex-col p-1">
                      <ng-container *ngTemplateOutlet="acciones; context: { $implicit: template }" />
                    </div>
                  </ui-menu>
                }

                <ui-icon-button
                  name="dots-three"
                  [label]="'Acciones sobre ' + template.name"
                  [pressedState]="openMenu() === template.id"
                  (pressed)="openMenu.set(openMenu() === template.id ? null : template.id)" />
              </div>
            </li>
          }
        </ul>
      }
    </div>

    <ng-template #acciones let-template>
      <button type="button" class="accion" (click)="askName('rename', template)">
        <ui-icon name="pencil-simple" [size]="18" />
        <span>Cambiar el nombre</span>
      </button>
      <button type="button" class="accion" (click)="askName('duplicate', template)">
        <ui-icon name="copy" [size]="18" />
        <span>Duplicar</span>
      </button>
      <button type="button" class="accion accion--danger" (click)="remove(template)">
        <ui-icon name="trash" [size]="18" />
        <span>Eliminar</span>
      </button>
    </ng-template>

    @if (!isDesktop() && selected(); as template) {
      <ui-bottom-sheet
        [open]="openMenu() !== null"
        [title]="template.name"
        (closed)="openMenu.set(null)">
        <div class="flex flex-col pb-2">
          <ng-container *ngTemplateOutlet="acciones; context: { $implicit: template }" />
        </div>
      </ui-bottom-sheet>
    }

    @if (householdId(); as householdId) {
      <app-template-name-dialog
        [open]="asking() !== null"
        [intent]="intent()"
        [initial]="initialName()"
        [saving]="saving()"
        [error]="dialogError()"
        (closed)="asking.set(null)"
        (confirmed)="confirm(householdId, $event)" />
    }
  `,
  styles: `
    :host { display: block; }

    .accion {
      display: flex;
      width: 100%;
      align-items: center;
      gap: 0.625rem;
      border-radius: var(--radius-sm);
      padding: 0.625rem 0.75rem;
      text-align: left;
      font-size: 15px;
      color: var(--text);
    }
    .accion:hover { background: var(--surface-sunken); }
    .accion:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
    .accion--danger { color: var(--danger); }
  `,
})
export class TemplatesPage {
  protected readonly store = inject(TemplateStore);
  private readonly api = inject(TemplateApi);
  private readonly toasts = inject(ToastService);

  protected readonly householdId = inject(HouseholdContextService).householdId;

  /** Una compra semanal de verdad, con cantidades que alguien reconocería. */
  protected readonly EJEMPLO = [
    { nombre: 'Huevos', cantidad: '10 un' },
    { nombre: 'Leche entera', cantidad: '2 L' },
    { nombre: 'Arroz grano largo', cantidad: '1 kg' },
  ];

  protected readonly isDesktop = inject(ViewportService).isDesktop;

  protected readonly openMenu = signal<string | null>(null);

  /** La plantilla cuyo menú está abierto. La hoja inferior la titula con su nombre. */
  protected readonly selected = computed(() =>
    this.store.templates().find((t) => t.id === this.openMenu()) ?? null);
  protected readonly saving = signal(false);
  protected readonly dialogError = signal('');

  /** Qué se está preguntando, y sobre cuál. `null` con el diálogo cerrado. */
  protected readonly asking = signal<{ intent: NameIntent; template: TemplateSummary | null } | null>(null);

  protected readonly intent = computed<NameIntent>(() => this.asking()?.intent ?? 'create');

  protected readonly initialName = computed(() => {
    const asking = this.asking();
    if (!asking?.template) {
      return '';
    }
    // Al duplicar, el nombre no puede repetirse: el hogar no admite dos iguales. Se propone
    // uno libre para que el usuario no tenga que descubrir el choque al pulsar.
    return asking.intent === 'duplicate'
      ? this.freeName(`${asking.template.name} (copia)`)
      : asking.template.name;
  });

  protected subtitle(template: TemplateSummary): string {
    const productos = template.itemCount === 1 ? '1 producto' : `${template.itemCount} productos`;
    return template.createdByName ? `${productos} · ${template.createdByName}` : productos;
  }

  protected askName(intent: NameIntent, template: TemplateSummary | null = null): void {
    this.openMenu.set(null);
    this.dialogError.set('');
    this.asking.set({ intent, template });
  }

  protected confirm(householdId: string, name: string): void {
    const asking = this.asking();
    if (!asking || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.dialogError.set('');

    const accion = asking.intent === 'rename' && asking.template
      ? this.api.rename(householdId, asking.template.id, name)
      : asking.intent === 'duplicate' && asking.template
        ? this.duplicate(householdId, asking.template, name)
        : this.api.create(householdId, name);

    accion.subscribe({
      next: () => {
        this.saving.set(false);
        this.asking.set(null);
        this.store.reload();
        this.toasts.success(this.successMessage(asking.intent, name));
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.dialogError.set(this.detailOf(error));
      },
    });
  }

  /**
   * Duplicar sin endpoint propio: se lee el detalle de la original y se crea otra con sus
   * líneas. La API ya permite crear con líneas, así que no hacía falta inventar nada.
   */
  private duplicate(householdId: string, template: TemplateSummary, name: string) {
    return this.api.get(householdId, template.id).pipe(
      switchMap((detail) => this.api.create(householdId, name, detail.items.map((item) => ({
        productId: item.productId,
        desiredQuantity: item.desiredQuantity,
      })))),
    );
  }

  protected remove(template: TemplateSummary): void {
    const householdId = this.householdId();
    if (!householdId) {
      return;
    }
    this.openMenu.set(null);
    this.api.remove(householdId, template.id).subscribe({
      next: () => {
        this.store.reload();
        this.toasts.success(`«${template.name}» se eliminó`);
      },
      error: () => this.toasts.error(
        `No se pudo eliminar «${template.name}»`,
        'Revisa la conexión y vuelve a intentarlo.'),
    });
  }

  /** Un nombre que todavía no existe en el hogar: «(copia)», «(copia 2)», y así. */
  private freeName(candidate: string): string {
    const usados = new Set(this.store.templates().map((t) => t.name.toLowerCase()));
    if (!usados.has(candidate.toLowerCase())) {
      return candidate;
    }
    for (let n = 2; n < 50; n++) {
      const intento = `${candidate.replace(/\)$/, '')} ${n})`;
      if (!usados.has(intento.toLowerCase())) {
        return intento;
      }
    }
    return candidate;
  }

  private successMessage(intent: NameIntent, name: string): string {
    if (intent === 'rename') {
      return `Ahora se llama «${name}»`;
    }
    return intent === 'duplicate' ? `Se duplicó como «${name}»` : `«${name}» está lista`;
  }

  private detailOf(error: HttpErrorResponse): string {
    return typeof error.error?.detail === 'string'
      ? error.error.detail
      : 'No se pudo guardar. Revisa la conexión y vuelve a intentarlo.';
  }
}
