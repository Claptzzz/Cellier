import { Injectable, signal } from '@angular/core';

export type ToastTone = 'info' | 'ok' | 'warn' | 'danger';

/**
 * Una acción dentro del aviso. Se usa para deshacer.
 *
 * <p>Deshacer vive aquí, y no en un diálogo de confirmación antes de actuar, porque la
 * acción es barata de hacer y cara de reconstruir: quitar una línea es un toque, y
 * devolverla obliga a recordar qué producto era y con qué cantidad. Preguntar antes cobra
 * un paso a todo el mundo; deshacer después sólo se lo cobra a quien se equivocó.
 */
export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

export interface Toast {
  readonly id: number;
  readonly tone: ToastTone;
  readonly title: string;
  readonly detail?: string;
  readonly action?: ToastAction;
}

/** Cuánto vive un aviso antes de irse solo. Los errores duran más. */
const TTL_MS: Record<ToastTone, number> = {
  info: 4000,
  ok: 4000,
  warn: 6000,
  danger: 8000,
};

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 0;

  private readonly items = signal<readonly Toast[]>([]);

  readonly toasts = this.items.asReadonly();

  show(tone: ToastTone, title: string, detail?: string, action?: ToastAction): number {
    const id = this.nextId++;
    this.items.update((current) => [...current, { id, tone, title, detail, action }]);
    // El temporizador no se cancela al pasar el ratón a propósito: estos avisos
    // son transitorios y nunca llevan la única copia de una información.
    setTimeout(() => this.dismiss(id), TTL_MS[tone]);
    return id;
  }

  info(title: string, detail?: string): number {
    return this.show('info', title, detail);
  }

  success(title: string, detail?: string): number {
    return this.show('ok', title, detail);
  }

  warn(title: string, detail?: string): number {
    return this.show('warn', title, detail);
  }

  error(title: string, detail?: string): number {
    return this.show('danger', title, detail);
  }

  /** Ejecuta la acción del aviso y lo cierra: deshecho lo que fuera, ya no hay nada que decir. */
  run(id: number): void {
    this.items().find((toast) => toast.id === id)?.action?.run();
    this.dismiss(id);
  }

  dismiss(id: number): void {
    this.items.update((current) => current.filter((toast) => toast.id !== id));
  }

  clear(): void {
    this.items.set([]);
  }
}
