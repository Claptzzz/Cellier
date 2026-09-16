import {
  ChangeDetectionStrategy, Component, computed, inject, signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { HouseholdContextService } from '../../core/household/household-context.service';
import { formatQuantity, unitLabel } from '../../core/pantry/pantry.models';
import { groupByCategory } from '../../core/templates/report.models';
import { TemplateApi } from '../../core/templates/template.api';
import type { ReportItem, TemplateReport } from '../../core/templates/report.models';
import { ToastService } from '../../core/toast/toast.service';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { Skeleton } from '../../shared/ui/skeleton';
import { reportAsText } from './report-text';

/**
 * La lista de la compra: lo que falta para cumplir una plantilla.
 *
 * <p>Se lee caminando por un pasillo, con el teléfono en una mano. De ahí que lo que falta
 * vaya primero y agrupado por categoría —el orden lo pone el servidor—, que cada línea diga
 * la cifra que hay que llevarse, y que marcar lo comprado sea un toque grande.
 *
 * <p><strong>No dibuja la banda de nivel.</strong> La banda codifica una proporción respecto
 * del nivel objetivo de la despensa, que es otro número y responde otra pregunta. Ponerla
 * aquí invitaría a leer las dos como una sola. Ver P2b en docs/reglas-plantillas.md.
 *
 * <p>Lo marcado vive sólo aquí: no se guarda ni viaja. Es una ayuda para no perder el sitio
 * mientras se recorre el súper, no un estado del hogar.
 */
@Component({
  selector: 'app-report-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, EmptyState, Icon, RouterLink, Skeleton],
  template: `
    <div class="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-4">

      <a
        class="flex w-fit items-center gap-1.5 text-[13px] text-text-muted
               hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2
               focus-visible:outline-accent"
        data-print="hide"
        [routerLink]="['../']">
        <ui-icon name="arrow-left" [size]="16" />
        <span>Volver a la plantilla</span>
      </a>

      @if (loading()) {
        <div class="flex flex-col gap-4" aria-busy="true">
          <ui-skeleton width="60%" height="24px" label="Calculando el reporte" />
          <ui-skeleton width="100%" height="10px" radius="999px" />
          @for (fila of [1, 2, 3, 4, 5]; track fila) {
            <ui-skeleton width="100%" height="20px" />
          }
        </div>
      } @else if (failed()) {
        <ui-empty-state
          icon="warning-circle"
          title="No pudimos calcular el reporte"
          description="Se compara con tu despensa de ahora mismo, así que hace falta conexión.">
          <ui-button icon="arrows-clockwise" (pressed)="load()">Reintentar</ui-button>
        </ui-empty-state>
      } @else if (report(); as report) {

        <!-- ============ ENCABEZADO ============ -->
        <header class="flex flex-col gap-3">
          <h1 class="font-display text-[24px] font-semibold tracking-tight text-text">
            {{ report.templateName }}
          </h1>

          @if (missing().length === 0) {
            <!-- Sobrio a propósito: es una confirmación, no una celebración. Quien lo ve
                 está a punto de guardar el teléfono, no de mirar una animación. -->
            <p class="flex items-center gap-2 text-[17px] text-ok">
              <ui-icon name="check-circle" [size]="22" />
              <span>No falta nada. Tienes todo lo de esta plantilla.</span>
            </p>
          } @else {
            <p class="text-[17px] text-text">{{ headline() }}</p>
          }

          <!-- ============ COMPLETITUD ============
               NO es la banda de nivel y no puede parecerlo: la banda es un canto vertical de
               4px que mide cantidad contra un objetivo. Esto es una barra horizontal que mide
               LÍNEAS cubiertas, y lo dice con palabras justo debajo para que nadie lo lea
               como «nivel de existencias». -->
          <div class="flex flex-col gap-1.5">
            <div
              data-completitud
              class="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
              role="img"
              [attr.aria-label]="coverageLabel()">
              <div
                class="h-full rounded-full bg-accent transition-[width] duration-300"
                [style.width.%]="coveragePercent()"></div>
            </div>
            <p class="text-[13px] text-text-muted">{{ coverageLabel() }}</p>
          </div>

          <!-- ============ ACCIONES ============
               Sólo si hay algo que comprar: copiar, compartir e imprimir existen para
               llevarse la lista, y sin faltantes no hay lista que llevar. -->
          @if (missing().length > 0) {
          <div class="flex flex-wrap gap-2" data-print="hide">
            <ui-button variant="secondary" icon="copy" (pressed)="copy(report)">
              Copiar lista
            </ui-button>
            @if (canShare()) {
              <ui-button variant="secondary" icon="share-network" (pressed)="share(report)">
                Compartir
              </ui-button>
            }
            <ui-button variant="secondary" icon="printer" (pressed)="print()">
              Imprimir
            </ui-button>
          </div>
          }
        </header>

        <!-- ============ LO QUE FALTA ============ -->
        @if (missing().length > 0) {
          <div class="flex flex-col gap-5">
            @for (grupo of groups(); track grupo.category) {
              <section class="flex flex-col gap-1">
                <h2 class="text-[13px] font-medium uppercase tracking-wide text-text-muted">
                  {{ grupo.category }}
                </h2>

                <ul class="flex list-none flex-col gap-0 p-0">
                  @for (item of grupo.items; track item.productId) {
                    <li>
                      <label
                        class="flex cursor-pointer items-center gap-3 border-b border-border py-3
                               last:border-0"
                        [class.opacity-55]="isChecked(item)">
                        <input
                          type="checkbox"
                          class="h-6 w-6 flex-none accent-accent"
                          [checked]="isChecked(item)"
                          (change)="toggle(item)" />

                        <span class="flex min-w-0 flex-1 flex-col">
                          <span
                            class="truncate text-[16px] text-text"
                            [class.line-through]="isChecked(item)">
                            {{ item.productName }}
                          </span>
                          <span class="truncate text-[13px] text-text-muted">
                            {{ detailOf(item) }}
                          </span>
                        </span>

                        <span class="flex-none font-mono text-[17px] tabular-nums text-text">
                          {{ missingOf(item) }}
                        </span>
                      </label>
                    </li>
                  }
                </ul>
              </section>
            }
          </div>
        }

        <!-- ============ LO QUE YA ESTÁ ============ -->
        @if (complete().length > 0) {
          <details class="rounded-md border border-border bg-surface-raised">
            <summary
              class="cursor-pointer list-none px-4 py-3 text-[14px] text-text-muted
                     focus-visible:outline-2 focus-visible:outline-offset-[-2px]
                     focus-visible:outline-accent">
              {{ completeLabel() }}
            </summary>
            <ul class="flex list-none flex-col gap-0 border-t border-border px-4 py-1">
              @for (item of complete(); track item.productId) {
                <li class="flex items-baseline justify-between gap-3 border-b border-border py-2.5
                           last:border-0">
                  <span class="truncate text-[14px] text-text-muted">{{ item.productName }}</span>
                  <span class="flex-none font-mono text-[13px] tabular-nums text-text-muted">
                    {{ availableOf(item) }}
                  </span>
                </li>
              }
            </ul>
          </details>
        }

        <p class="text-[12px] text-text-muted">{{ generatedLabel() }}</p>
      }
    </div>
  `,
  styles: `
    :host { display: block; }

    @media print {
      /* La barra de completitud NO se imprime: es un fondo de color, sale gris en la
         mayoría de las impresoras y gasta tinta para decir lo que la línea de debajo ya
         dice con palabras. */
      [data-completitud] { display: none !important; }

      /* Lo que YA TIENES tampoco. El papel se lleva al súper, y ahí sólo importa lo que
         falta; en pantalla se puede desplegar, en papel sólo sería ruido. */
      details { display: none !important; }

      /* La casilla, dibujada como una casilla de papel: un cuadro para marcar a lápiz. */
      input[type='checkbox'] {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        border: 1px solid #000;
        border-radius: 2px;
      }
    }
  `,
})
export class ReportPage {
  private readonly api = inject(TemplateApi);
  private readonly toasts = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly context = inject(HouseholdContextService);

  protected readonly report = signal<TemplateReport | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);

  /** Lo marcado en el pasillo. Local y efímero: no se guarda ni viaja. */
  private readonly checked = signal<ReadonlySet<string>>(new Set());

  protected readonly missing = computed(() =>
    this.report()?.items.filter((item) => item.status === 'MISSING') ?? []);

  protected readonly complete = computed(() =>
    this.report()?.items.filter((item) => item.status === 'COMPLETE') ?? []);

  protected readonly groups = computed(() => groupByCategory(this.missing()));

  protected readonly canShare = signal(typeof navigator !== 'undefined' && 'share' in navigator);

  protected readonly headline = computed(() => {
    const total = this.missing().length;
    return total === 1 ? 'Falta 1 producto.' : `Faltan ${total} productos.`;
  });

  /**
   * Dice en palabras QUÉ mide. Un porcentaje suelto se puede leer como nivel de existencias,
   * que es justo la otra pregunta del producto.
   */
  protected readonly coverageLabel = computed(() => {
    const summary = this.report()?.summary;
    if (!summary || summary.totalItems === 0) {
      return 'Esta plantilla no tiene productos.';
    }
    const cubiertos = summary.totalItems - summary.missingItems;
    return `${cubiertos} de ${summary.totalItems} productos cubiertos`;
  });

  protected readonly coveragePercent = computed(() =>
    Math.round((this.report()?.summary.completionRate ?? 0) * 100));

  protected readonly completeLabel = computed(() => {
    const total = this.complete().length;
    return total === 1 ? 'Ya tienes 1 producto' : `Ya tienes ${total} productos`;
  });

  protected readonly generatedLabel = computed(() => {
    const generatedAt = this.report()?.generatedAt;
    if (!generatedAt) {
      return '';
    }
    const hora = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit' })
      .format(new Date(generatedAt));
    return `Comparado con tu despensa a las ${hora}.`;
  });

  constructor() {
    this.load();
  }

  /** Siempre fresco. El sentido de la pantalla es reflejar el stock de ahora mismo. */
  protected load(): void {
    const householdId = this.context.householdId();
    const templateId = this.route.snapshot.paramMap.get('templateId');
    if (!householdId || !templateId) {
      return;
    }
    this.loading.set(true);
    this.failed.set(false);
    this.api.report(householdId, templateId).subscribe({
      next: (report) => {
        this.report.set(report);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });
  }

  protected isChecked(item: ReportItem): boolean {
    return this.checked().has(item.productId);
  }

  protected toggle(item: ReportItem): void {
    this.checked.update((current) => {
      const next = new Set(current);
      if (!next.delete(item.productId)) {
        next.add(item.productId);
      }
      return next;
    });
  }

  /** «Faltan 6 · tienes 4 de 10». Las tres cifras que decide quién está en el pasillo. */
  protected detailOf(item: ReportItem): string {
    const unidad = unitLabel(item.unit);
    return `Faltan ${formatQuantity(item.missingQuantity)} · tienes `
      + `${formatQuantity(item.availableQuantity)} de ${formatQuantity(item.desiredQuantity)} ${unidad}`;
  }

  protected missingOf(item: ReportItem): string {
    return `${formatQuantity(item.missingQuantity)} ${unitLabel(item.unit)}`;
  }

  protected availableOf(item: ReportItem): string {
    return `${formatQuantity(item.availableQuantity)} ${unitLabel(item.unit)}`;
  }

  protected async copy(report: TemplateReport): Promise<void> {
    try {
      await navigator.clipboard.writeText(reportAsText(report));
      this.toasts.success('Lista copiada', 'Ya puedes pegarla donde quieras.');
    } catch {
      this.toasts.error('No se pudo copiar', 'Tu navegador no nos dejó usar el portapapeles.');
    }
  }

  protected async share(report: TemplateReport): Promise<void> {
    try {
      await navigator.share({ title: report.templateName, text: reportAsText(report) });
    } catch {
      // Cancelar el diálogo de compartir también llega aquí, y no es un error que contar.
    }
  }

  protected print(): void {
    window.print();
  }
}
