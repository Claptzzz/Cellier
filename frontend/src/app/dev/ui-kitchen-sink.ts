import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { ToastService } from '../core/toast/toast.service';
import {
  Badge, BottomSheet, Button, Card, Dialog, EmptyState, Icon, IconButton, Menu,
  Input, LevelBand, QuantityStepper, Select, Skeleton,
} from '../shared/ui';
import type { LevelState } from '../shared/ui';

interface DemoRow {
  readonly name: string;
  readonly place: string;
  readonly due: string;
  readonly qty: string;
  readonly level: number;
  readonly state: LevelState;
}

/**
 * Kitchen sink: la referencia visual del equipo.
 *
 * Sólo se registra la ruta en desarrollo (ver app.routes.ts), así que este
 * componente no entra en el bundle de producción.
 */
@Component({
  selector: 'app-ui-kitchen-sink',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Badge, BottomSheet, Button, Card, Dialog, EmptyState, Icon, IconButton, Menu,
    Input, LevelBand, QuantityStepper, Select, Skeleton,
  ],
  template: `
    <div class="mx-auto flex max-w-4xl flex-col gap-10 pb-16">

      <header class="flex flex-col gap-1">
        <h1 class="font-display text-[32px] font-semibold tracking-tight text-text">
          Sistema de diseño
        </h1>
        <p class="text-[15px] text-text-muted">
          Referencia visual de Cellier. Cada componente aquí es el mismo que usa la app.
        </p>
      </header>

      <!-- ================= TOKENS ================= -->
      <section class="flex flex-col gap-3">
        <h2 class="font-display text-[24px] font-semibold tracking-tight text-text">Tokens</h2>
        <p class="text-[14px] text-text-muted">
          Once tokens semánticos. Ningún componente escribe un hex.
        </p>

        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          @for (token of tokens; track token.name) {
            <div class="flex flex-col gap-1.5 rounded-md border border-border bg-surface-raised p-3">
              <span
                class="h-10 w-full rounded-sm border border-border"
                [style.background]="'var(' + token.name + ')'"></span>
              <code class="font-mono text-[11px] text-text">{{ token.name }}</code>
              <span class="text-[11px] leading-tight text-text-muted">{{ token.use }}</span>
            </div>
          }
        </div>
      </section>

      <!-- ================= BANDA DE NIVEL ================= -->
      <section class="flex flex-col gap-3">
        <h2 class="font-display text-[24px] font-semibold tracking-tight text-text">
          Banda de nivel
        </h2>
        <p class="max-w-[65ch] text-[14px] leading-relaxed text-text-muted">
          El elemento firma. La altura rellena dice cuánto queda respecto del nivel objetivo;
          el canal de fondo da la referencia contra la que se lee esa proporción. El llenado
          es el canal robusto: sobreviven los cuatro niveles en escala de grises, con 67 puntos
          de luminancia entre relleno y canal. El <strong class="text-text">color</strong> del
          estado es refuerzo, no el único canal: los tres tonos de estado tienen luminancias
          casi idénticas, así que quien no distingue color lee el estado en el texto de la fila
          y en el Badge, que acompañan siempre a la banda.
        </p>

        <div class="flex flex-col gap-2">
          @for (row of rows; track row.name) {
            <article
              class="flex items-stretch gap-3 rounded-md border border-border
                     bg-surface-raised p-3 shadow-e1">
              <ui-level-band [level]="row.level" [state]="row.state" [itemLabel]="row.name" />

              <div class="flex min-w-0 flex-1 items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-[15px] font-medium text-text">{{ row.name }}</p>
                  <p class="truncate text-[13px] text-text-muted">
                    {{ row.place }} · {{ row.due }}
                  </p>
                </div>
                <span class="flex-none font-mono text-[15px] tabular-nums text-text">
                  {{ row.qty }}
                </span>
              </div>
            </article>
          }
        </div>
      </section>

      <!-- ================= TIPOGRAFÍA ================= -->
      <section class="flex flex-col gap-3">
        <h2 class="font-display text-[24px] font-semibold tracking-tight text-text">Tipografía</h2>
        <div class="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4">
          <div>
            <p class="font-display text-[32px] font-semibold tracking-tight text-text">
              Bricolage Grotesque
            </p>
            <p class="text-[13px] text-text-muted">
              Display. Sólo ≥20px: por debajo, sus terminales irregulares se emborronan.
            </p>
          </div>
          <div class="border-t border-border pt-3">
            <p class="text-[15px] text-text">
              Geist. Cuerpo a 15px, controles a 16px por el auto-zoom de Safari en iOS.
            </p>
            <p class="text-[13px] text-text-muted">Texto secundario a 13px.</p>
          </div>
          <div class="border-t border-border pt-3">
            <p class="font-mono text-[15px] tabular-nums text-text">
              1.240 kg · 0,75 L · 340 g · 12 u
            </p>
            <p class="text-[13px] text-text-muted">
              Geist Mono con cifras tabulares: las cantidades se comparan en columna.
            </p>
          </div>
        </div>
      </section>

      <!-- ================= BOTONES ================= -->
      <section class="flex flex-col gap-3">
        <h2 class="font-display text-[24px] font-semibold tracking-tight text-text">Botones</h2>

        <div class="flex flex-wrap items-center gap-2">
          <ui-button variant="primary">Guardar</ui-button>
          <ui-button variant="secondary">Cancelar</ui-button>
          <ui-button variant="ghost">Omitir</ui-button>
          <ui-button variant="danger" icon="trash">Eliminar</ui-button>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <ui-button size="sm" icon="plus">Pequeño</ui-button>
          <ui-button size="md" icon="plus">Mediano</ui-button>
          <ui-button size="lg" icon="plus">Grande</ui-button>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <ui-button [loading]="true">Cargando</ui-button>
          <ui-button [disabled]="true">Desactivado</ui-button>
          <ui-icon-button name="pencil-simple" label="Editar" />
          <ui-icon-button name="trash" label="Eliminar" variant="solid" />
          <ui-icon-button name="dots-three" label="Más acciones" [disabled]="true" />
        </div>
      </section>

      <!-- ================= FORMULARIO ================= -->
      <section class="flex flex-col gap-3">
        <h2 class="font-display text-[24px] font-semibold tracking-tight text-text">Formulario</h2>

        <div class="grid gap-4 sm:grid-cols-2">
          <ui-input label="Nombre del artículo" placeholder="Arroz grano largo" icon="magnifying-glass" />
          <ui-input label="Correo" type="email" autocomplete="email" placeholder="ana@ejemplo.cl" />
          <ui-input label="Notas" [required]="false" hint="Visible para todo el hogar." />
          <ui-input label="Cantidad" error="Debe ser un número mayor que cero." />
          <ui-select label="Ubicación" [options]="places" placeholder="Elige una ubicación" />
          <ui-select label="Unidad" [options]="units" error="Selecciona una unidad." />
        </div>

        <div class="flex flex-wrap items-end gap-4 pt-2">
          <div class="flex flex-col gap-1.5">
            <span class="text-[13px] font-medium text-text">Cantidad</span>
            <ui-quantity-stepper
              [value]="qty()"
              unit="kg"
              [step]="0.5"
              (valueChange)="qty.set($event)" />
          </div>
          <div class="flex flex-col gap-1.5">
            <span class="text-[13px] font-medium text-text">Desactivado</span>
            <ui-quantity-stepper [value]="2" unit="L" [disabled]="true" />
          </div>
        </div>
      </section>

      <!-- ================= ETIQUETAS ================= -->
      <section class="flex flex-col gap-3">
        <h2 class="font-display text-[24px] font-semibold tracking-tight text-text">Etiquetas</h2>
        <div class="flex flex-wrap gap-2">
          <ui-badge tone="neutral">Alacena</ui-badge>
          <ui-badge tone="accent">Plantilla</ui-badge>
          <ui-badge tone="ok">Suficiente</ui-badge>
          <ui-badge tone="warn">Vence pronto</ui-badge>
          <ui-badge tone="danger">Vencido</ui-badge>
        </div>
      </section>

      <!-- ================= CARGA Y VACÍO ================= -->
      <section class="flex flex-col gap-3">
        <h2 class="font-display text-[24px] font-semibold tracking-tight text-text">
          Carga y vacío
        </h2>

        <ui-card>
          <div class="flex flex-col gap-3">
            @for (row of [1, 2, 3]; track row) {
              <div class="flex items-center gap-3">
                <ui-skeleton width="4px" height="40px" radius="999px" />
                <div class="flex flex-1 flex-col gap-1.5">
                  <ui-skeleton width="60%" height="15px" />
                  <ui-skeleton width="35%" height="13px" />
                </div>
                <ui-skeleton width="56px" height="15px" />
              </div>
            }
          </div>
        </ui-card>

        <ui-card [padded]="false">
          <ui-empty-state
            icon="package"
            title="Tu despensa está vacía"
            description="Cuando agregues artículos aparecerán aquí, con su nivel y su fecha de vencimiento.">
            <ui-button icon="plus">Añadir el primero</ui-button>
          </ui-empty-state>
        </ui-card>
      </section>

      <!-- ================= SUPERPUESTOS ================= -->
      <section class="flex flex-col gap-3">
        <h2 class="font-display text-[24px] font-semibold tracking-tight text-text">
          Superpuestos y avisos
        </h2>
        <div class="flex flex-wrap gap-2">
          <ui-button variant="secondary" (pressed)="dialogOpen.set(true)">Abrir diálogo</ui-button>
          <ui-button variant="secondary" (pressed)="sheetOpen.set(true)">Abrir hoja inferior</ui-button>
          <ui-button variant="secondary" (pressed)="toast.success('Artículo guardado', 'Arroz grano largo, 2 kg.')">
            Aviso correcto
          </ui-button>
          <ui-button variant="secondary" (pressed)="toast.warn('Vence pronto', 'La leche entera vence mañana.')">
            Aviso de atención
          </ui-button>
          <ui-button variant="secondary" (pressed)="toast.error('No se pudo guardar', 'Revisa tu conexión.')">
            Aviso de error
          </ui-button>
        </div>
      </section>

      <ui-dialog title="Eliminar artículo" [open]="dialogOpen()" (closed)="dialogOpen.set(false)">
        <p class="text-[15px] leading-relaxed text-text">
          Se quitará <strong>Arroz grano largo</strong> de la despensa de Casa Rivas.
          El resto del hogar dejará de verlo.
        </p>
        <div slot="footer" class="flex gap-2">
          <ui-button variant="secondary" (pressed)="dialogOpen.set(false)">Cancelar</ui-button>
          <ui-button variant="danger" (pressed)="dialogOpen.set(false)">Eliminar</ui-button>
        </div>
      </ui-dialog>

      <!-- ====================== AÑADIDOS DEL MÓDULO DE HOGARES ====================== -->
      <section class="flex flex-col gap-4">
        <h2 class="font-display text-[20px] font-semibold tracking-tight text-text text-balance">
          Menu, Button en modo enlace, Input monoespaciado
        </h2>

        <div class="flex flex-col gap-3">
          <p class="text-[14px] leading-relaxed text-text-muted [overflow-wrap:anywhere]">
            <strong class="text-text">Menu</strong> es el panel anclado, equivalente de
            escritorio de la hoja inferior. Se coloca midiendo el sitio disponible: abierto
            cerca del borde inferior crece hacia arriba en vez de salirse de la pantalla.
            Cierra con Escape y al pulsar fuera, y devuelve el foco al disparador.
          </p>

          <!-- max-w-full y botón a ancho completo: con w-fit a secas el disparador
               medía 198px dentro de un viewport de 188 (que es lo que quedan de 375 al
               ampliar al 200%) y empujaba el ancho de toda la página. -->
          <div class="relative w-fit max-w-full">
            <ui-button
              variant="secondary"
              icon="caret-up-down"
              [block]="true"
              (pressed)="menuOpen.set(!menuOpen())">
              Abrir menú anclado
            </ui-button>
            <ui-menu [open]="menuOpen()" label="Ejemplo de menú" (closed)="menuOpen.set(false)">
              <div class="flex flex-col gap-0.5">
                <button type="button" class="kitchen-menu-item" (click)="menuOpen.set(false)">
                  <ui-icon name="check" [size]="18" /><span>Una opción</span>
                </button>
                <button type="button" class="kitchen-menu-item" (click)="menuOpen.set(false)">
                  <ui-icon name="pencil-simple" [size]="18" /><span>Otra opción</span>
                </button>
                <button type="button" class="kitchen-menu-item" disabled>
                  <ui-icon name="trash" [size]="18" /><span>Deshabilitada</span>
                </button>
              </div>
            </ui-menu>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <p class="text-[14px] leading-relaxed text-text-muted [overflow-wrap:anywhere]">
            <strong class="text-text">Button</strong> con <code class="font-mono [overflow-wrap:anywhere]">link</code>
            renderiza un <code class="font-mono [overflow-wrap:anywhere]">&lt;a&gt;</code> en vez de un
            <code class="font-mono [overflow-wrap:anywhere]">&lt;button&gt;</code>: mismo aspecto, semántica correcta.
            Navegar es seguir un enlace, y con un botón se pierde el anuncio del lector de
            pantalla y el abrir en otra pestaña.
          </p>
          <div class="flex flex-wrap gap-2">
            <ui-button variant="primary" link="/dev/ui">Enlace primario</ui-button>
            <ui-button variant="secondary" icon="house" link="/dev/ui">Enlace con icono</ui-button>
            <ui-button variant="ghost" (pressed)="noop()">Botón, para comparar</ui-button>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <p class="text-[14px] leading-relaxed text-text-muted [overflow-wrap:anywhere]">
            <strong class="text-text">Input</strong> con <code class="font-mono [overflow-wrap:anywhere]">mono</code>
            para valores que se transcriben carácter a carácter. Mantiene los 16px de
            <code class="font-mono [overflow-wrap:anywhere]">--text-control</code>: la variante cambia familia y
            espaciado, nunca el tamaño que evita el auto-zoom de Safari en iOS.
          </p>
          <div class="grid gap-3 sm:grid-cols-2">
            <ui-input label="Normal" placeholder="Arroz grano largo" [required]="false" />
            <ui-input
              label="Monoespaciado"
              placeholder="K7M2QP9X"
              [mono]="true"
              [required]="false"
              hint="8 caracteres, sin 0, O, 1, I ni L." />
          </div>
        </div>
      </section>

      <ui-bottom-sheet title="Ajustar cantidad" [open]="sheetOpen()" (closed)="sheetOpen.set(false)">
        <div class="flex flex-col gap-4">
          <p class="text-[15px] text-text-muted">Arroz grano largo, en la alacena.</p>
          <div class="flex justify-center">
            <ui-quantity-stepper [value]="qty()" unit="kg" [step]="0.5" (valueChange)="qty.set($event)" />
          </div>
          <ui-button [block]="true" size="lg" (pressed)="sheetOpen.set(false)">Guardar</ui-button>
        </div>
      </ui-bottom-sheet>

      <!-- ================= ICONOS ================= -->
      <section class="flex flex-col gap-3">
        <h2 class="font-display text-[24px] font-semibold tracking-tight text-text">Iconos</h2>
        <p class="text-[14px] text-text-muted">
          Phosphor, peso regular. Un solo set en toda la app.
        </p>
        <div class="flex flex-wrap gap-3">
          @for (name of iconNames; track name) {
            <span
              class="flex h-11 w-11 items-center justify-center rounded-sm
                     border border-border bg-surface-raised text-text"
              [title]="name">
              <ui-icon [name]="name" [size]="20" />
            </span>
          }
        </div>
      </section>
    </div>
  `,
  styles: `
    :host { display: block; }

    .kitchen-menu-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: var(--touch-min);
      padding: 0 10px;
      border-radius: var(--radius-md);
      font-size: 15px;
      color: var(--text);
      text-align: left;
      transition: background-color 150ms;
    }
    .kitchen-menu-item:hover:not(:disabled) { background: var(--surface-sunken); }
    .kitchen-menu-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
    .kitchen-menu-item:disabled { opacity: 0.45; cursor: not-allowed; }
  `,
})
export class UiKitchenSink {
  protected readonly toast = inject(ToastService);

  protected readonly qty = signal(2);
  protected readonly dialogOpen = signal(false);
  protected readonly sheetOpen = signal(false);
  protected readonly menuOpen = signal(false);

  protected noop(): void {
    // El botón de comparación no hace nada: está para verlo junto al enlace.
  }

  protected readonly tokens = [
    { name: '--surface', use: 'Fondo de página' },
    { name: '--surface-raised', use: 'Tarjeta, header' },
    { name: '--surface-sunken', use: 'Hueco, track' },
    { name: '--text', use: 'Texto principal' },
    { name: '--text-muted', use: 'Texto secundario' },
    { name: '--border', use: 'Separador' },
    { name: '--border-strong', use: 'Contorno de control' },
    { name: '--accent', use: 'Acción, foco' },
    { name: '--accent-contrast', use: 'Sobre acento' },
    { name: '--ok', use: 'Nivel suficiente' },
    { name: '--warn', use: 'Vence pronto' },
    { name: '--danger', use: 'Vencido, agotado' },
  ] as const;

  protected readonly rows: readonly DemoRow[] = [
    { name: 'Arroz grano largo', place: 'Alacena', due: 'vence en 4 meses', qty: '2,0 kg', level: 92, state: 'ok' },
    { name: 'Café en grano', place: 'Alacena', due: 'vence en 2 meses', qty: '340 g', level: 55, state: 'ok' },
    { name: 'Leche entera', place: 'Refrigerador', due: 'vence mañana', qty: '1,0 L', level: 28, state: 'warn' },
    { name: 'Aceite de oliva', place: 'Alacena', due: 'vencido', qty: '0', level: 6, state: 'danger' },
  ];

  protected readonly places = [
    { value: 'PANTRY', label: 'Alacena' },
    { value: 'FRIDGE', label: 'Refrigerador' },
    { value: 'FREEZER', label: 'Congelador' },
    { value: 'OTHER', label: 'Otro' },
  ];

  protected readonly units = [
    { value: 'kg', label: 'Kilogramos' },
    { value: 'g', label: 'Gramos' },
    { value: 'l', label: 'Litros' },
    { value: 'u', label: 'Unidades' },
  ];

  protected readonly iconNames = [
    'package', 'list-checks', 'fork-knife', 'house', 'gear', 'sun', 'moon', 'desktop',
    'plus', 'minus', 'x', 'check', 'magnifying-glass', 'funnel', 'warning',
    'warning-circle', 'info', 'trash', 'pencil-simple', 'sign-out', 'arrow-left', 'tray',
  ] as const;
}
