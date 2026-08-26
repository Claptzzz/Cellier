import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';

/** Debe coincidir con la clave del script inline de index.html. */
export const CELLIER_THEME_STORAGE_KEY = 'cellier.theme';

const MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

function isThemeMode(value: string | null): value is ThemeMode {
  return value !== null && (MODES as readonly string[]).includes(value);
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  private readonly window = this.document.defaultView;

  /** Cambia solo cuando el sistema cambia de tema y estamos en modo 'system'. */
  private readonly systemPrefersDark = signal(this.readSystemPreference());

  private readonly modeSignal = signal<ThemeMode>(this.readStoredMode());

  /** Modo elegido por la persona: 'light' | 'dark' | 'system'. */
  readonly mode = this.modeSignal.asReadonly();

  /** Tema efectivo tras resolver 'system'. Es lo que se pinta. */
  readonly resolved = computed<'light' | 'dark'>(() => {
    const mode = this.modeSignal();
    if (mode === 'system') {
      return this.systemPrefersDark() ? 'dark' : 'light';
    }
    return mode;
  });

  readonly isDark = computed(() => this.resolved() === 'dark');

  constructor() {
    this.listenToSystemChanges();

    // Un único effect mantiene el DOM y localStorage en sincronía con la señal.
    effect(() => {
      const dark = this.isDark();
      const root = this.document.documentElement;
      root.classList.toggle('dark', dark);
      root.style.colorScheme = dark ? 'dark' : 'light';
    });

    effect(() => {
      const mode = this.modeSignal();
      try {
        this.window?.localStorage.setItem(CELLIER_THEME_STORAGE_KEY, mode);
      } catch {
        // Almacenamiento no disponible. La preferencia dura lo que la sesión.
      }
    });
  }

  set(mode: ThemeMode): void {
    this.modeSignal.set(mode);
  }

  /** Recorre claro -> oscuro -> sistema. Es el orden del botón del header. */
  cycle(): void {
    const order: readonly ThemeMode[] = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(this.modeSignal()) + 1) % order.length];
    this.modeSignal.set(next);
  }

  /**
   * matchMedia falta en algunos webviews antiguos y en entornos sin DOM completo.
   * Si no está, se asume tema claro en vez de reventar: un fallo aquí ocurre en el
   * constructor del servicio, así que tumbaría el arranque de toda la aplicación.
   */
  private get colorSchemeQuery(): MediaQueryList | null {
    if (typeof this.window?.matchMedia !== 'function') {
      return null;
    }
    return this.window.matchMedia('(prefers-color-scheme: dark)');
  }

  private readStoredMode(): ThemeMode {
    try {
      const stored = this.window?.localStorage.getItem(CELLIER_THEME_STORAGE_KEY) ?? null;
      return isThemeMode(stored) ? stored : 'system';
    } catch {
      return 'system';
    }
  }

  private readSystemPreference(): boolean {
    return this.colorSchemeQuery?.matches ?? false;
  }

  /**
   * Sigue los cambios del sistema en vivo. Se escucha siempre, pero `resolved`
   * sólo lo consulta cuando el modo es 'system', así que cambiar el tema del SO
   * con el modo forzado no mueve nada.
   */
  private listenToSystemChanges(): void {
    const query = this.colorSchemeQuery;
    if (typeof query?.addEventListener !== 'function') {
      return;
    }
    query.addEventListener('change', (event) => this.systemPrefersDark.set(event.matches));
  }
}
