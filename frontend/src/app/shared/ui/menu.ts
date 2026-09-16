import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  isDevMode,
  output,
  signal,
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
        [class.ui-menu-panel--above]="above()"
        role="group"
        [attr.aria-label]="label()">
        @if (title(); as texto) {
          <div class="ui-menu-title">{{ texto }}</div>
        }
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
      /* El minimo se acota con el propio maximo. min-width gana siempre a max-width
         en CSS, asi que un contenedor ancho —o ninguno, cuando el consumidor olvida el
         relative y el bloque contenedor pasa a ser el viewport— convertia este panel en
         una banda a todo lo ancho que tapaba media pantalla sin desbordar nada. */
      min-width: min(max(100%, 264px), 340px, calc(100vw - 24px));
      width: max-content;
      max-width: min(340px, calc(100vw - 24px));
      max-height: min(60dvh, 420px);
      overflow-y: auto;
      padding: 6px;
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-2);
      /* El input se llama align, que ademas es un atributo HTML de presentacion: el
         navegador lo traduce a text-align en todo el subarbol, asi que align="end"
         alineaba a la derecha el texto del panel. No se veia mientras el contenido era
         todo filas flex; el titulo, que es un bloque, lo saco a la luz. */
      text-align: start;
    }

    .ui-menu-panel--end { left: auto; right: 0; }

    /* Sobre que actua el panel. En una lista de filas iguales, el panel flotante pierde
       el vinculo con la fila que lo abrio en cuanto se mira dos segundos. */
    .ui-menu-title {
      padding: 6px 10px 8px;
      font-weight: 600;
      font-size: 13px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      margin-bottom: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Abierto en la última fila de una lista, el panel se saldría por abajo. Se voltea
       para crecer hacia arriba desde el borde superior del disparador. */
    .ui-menu-panel--above { top: auto; bottom: calc(100% + 6px); transform-origin: bottom; }

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
  /** Titulo visible dentro del panel. Vacio, el panel no lo pinta. */
  readonly title = input('');

  readonly closed = output<void>();

  /**
   * Si el panel crece hacia arriba. Se decide midiendo, no por una regla fija: el mismo
   * menú en la primera fila de una lista tiene sitio de sobra y en la última no.
   */
  protected readonly above = signal(false);

  /** Quién tenía el foco al abrir, para devolvérselo al cerrar. */
  private previouslyFocused: HTMLElement | null = null;

  constructor() {
    effect((onCleanup) => {
      if (!this.open()) {
        return;
      }

      this.previouslyFocused = document.activeElement as HTMLElement | null;
      this.above.set(false);

      queueMicrotask(() => {
        this.assertAnclado();
        this.placeVertically();
        // El foco entra en el panel: si se quedara en el disparador, un lector de
        // pantalla no anunciaría lo que acaba de aparecer.
        this.focusFirst();
      });

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

  /**
   * El panel esta `position: absolute`, asi que su bloque contenedor es el ancestro
   * posicionado mas cercano. Si el consumidor no envuelve disparador y panel en un
   * `relative`, ese ancestro pasa a ser el viewport y el panel se abre a todo lo ancho
   * de la pantalla, lejos de lo que lo abrio. Eso no desborda el documento ni oculta
   * nada, asi que ninguna comprobacion de visibilidad ni de desbordamiento lo delata:
   * sale mal y en silencio. Aqui deja de ser silencioso.
   */
  private assertAnclado(): void {
    if (!isDevMode()) {
      return;
    }
    const padre = this.panel()?.offsetParent;
    if (!padre || padre === document.body) {
      throw new Error(
        `ui-menu "${this.label()}" no tiene ancestro posicionado: envuelve el disparador ` +
          'y el <ui-menu> en un contenedor con `position: relative` ajustado al disparador.',
      );
    }
  }

  private container(): HTMLElement | null {
    return this.host.nativeElement.parentElement;
  }

  private panel(): HTMLElement | null {
    return this.container()?.querySelector('.ui-menu-panel') ?? null;
  }

  /**
   * Coloca el panel arriba o abajo según el sitio que quede, midiendo la geometría real.
   *
   * <p>Hace falta porque este panel se abre también dentro de filas de listas largas: en
   * la última fila, creciendo hacia abajo, quedaría fuera de la pantalla. Y un elemento
   * fuera de vista no está oculto, así que ninguna comprobación de visibilidad lo
   * delataría —es la misma trampa que dejó la hoja inferior invisible dentro de la
   * cabecera—.
   */
  private placeVertically(): void {
    const panel = this.panel();
    const trigger = this.container();
    if (!panel || !trigger) {
      return;
    }

    const anchor = trigger.getBoundingClientRect();
    const alto = panel.getBoundingClientRect().height;
    const holgura = 12;

    const cabeDebajo = anchor.bottom + 6 + alto + holgura <= window.innerHeight;
    const cabeEncima = anchor.top - 6 - alto - holgura >= 0;

    // Sólo se voltea si arriba cabe de verdad: si no cabe en ningún sitio, es mejor
    // abajo, donde el propio panel puede desplazarse con su `max-height`.
    this.above.set(!cabeDebajo && cabeEncima);
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
