import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  output,
} from '@angular/core';

/**
 * Panel flotante anclado a un disparador. El equivalente de escritorio de
 * {@link BottomSheet}: el mismo contenido, colocado donde está el cursor en vez de donde
 * llega el pulgar.
 *
 * <p>No usa `role="menu"`. Ese rol es para menús de aplicación y trae consigo un contrato
 * de teclado estricto —flechas obligatorias, Home/End, tipeo de primera letra— que un
 * grupo de enlaces no necesita y que se implementa mal con facilidad. Aquí es un grupo
 * etiquetado con contenido normal: cada elemento se tabula como lo que es.
 *
 * <p>Quien lo usa envuelve disparador y panel en un contenedor `relative`, y controla
 * `open`. El componente se encarga de Escape, del clic fuera y de devolver el foco al
 * disparador al cerrarse, que es donde el usuario espera encontrarlo.
 */
@Component({
  selector: 'ui-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div
        class="ui-menu-panel"
        [class.ui-menu-panel--end]="align() === 'end'"
        role="group"
        [attr.aria-label]="label()">
        <ng-content />
      </div>
    }
  `,
  styles: `
    :host { display: contents; }

    .ui-menu-panel {
      position: absolute;
      z-index: 50;
      top: calc(100% + 6px);
      left: 0;
      /* Al menos tan ancho como el disparador, pero con suelo propio: anclado a un
         disparador estrecho —el chip del hogar en la barra lateral— el contenido se
         partia en dos lineas y el texto de rol quedaba colgando. */
      min-width: max(100%, 264px);
      width: max-content;
      max-width: min(340px, calc(100vw - 24px));
      max-height: min(60dvh, 420px);
      overflow-y: auto;
      padding: 6px;
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-2);
    }

    .ui-menu-panel--end { left: auto; right: 0; }

    /* Aparece desde el borde del disparador, no desde el centro: el movimiento indica
       de dónde sale el panel. Bajo movimiento reducido, sólo el fundido. */
    .ui-menu-panel { animation: ui-menu-in 120ms ease-out; transform-origin: top; }
    @keyframes ui-menu-in {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .ui-menu-panel { animation: none; }
    }
  `,
})
export class Menu {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly open = input(false);
  readonly label = input.required<string>();
  readonly align = input<'start' | 'end'>('start');

  readonly closed = output<void>();

  /** Quién tenía el foco al abrir, para devolvérselo al cerrar. */
  private previouslyFocused: HTMLElement | null = null;

  constructor() {
    effect((onCleanup) => {
      if (!this.open()) {
        return;
      }

      this.previouslyFocused = document.activeElement as HTMLElement | null;

      // El foco entra en el panel: si se quedara en el disparador, un lector de pantalla
      // no anunciaría lo que acaba de aparecer.
      queueMicrotask(() => this.focusFirst());

      const onKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          this.close();
        }
      };

      // `pointerdown` y no `click`: cerrar en el clic hacia abajo evita que el elemento
      // que había debajo del panel reciba el clic al desaparecer este.
      const onPointerDown = (event: PointerEvent) => {
        const target = event.target as Node | null;
        // El contenedor es el padre `relative`, así que incluye al disparador: pulsar
        // sobre él debe alternar, no cerrar y reabrir.
        if (target && !this.container()?.contains(target)) {
          this.close();
        }
      };

      document.addEventListener('keydown', onKeydown, true);
      document.addEventListener('pointerdown', onPointerDown, true);
      onCleanup(() => {
        document.removeEventListener('keydown', onKeydown, true);
        document.removeEventListener('pointerdown', onPointerDown, true);
      });
    });
  }

  private container(): HTMLElement | null {
    return this.host.nativeElement.parentElement;
  }

  private panel(): HTMLElement | null {
    return this.container()?.querySelector('.ui-menu-panel') ?? null;
  }

  private focusFirst(): void {
    const focusable = this.panel()?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
  }

  private close(): void {
    this.closed.emit();
    // El foco vuelve al disparador; si no, se queda en el <body> y la siguiente
    // tabulación empieza desde el principio de la página.
    queueMicrotask(() => this.previouslyFocused?.focus());
  }
}
