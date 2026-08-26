import { Injectable, signal } from '@angular/core';

export type ToastTone = 'info' | 'ok' | 'warn' | 'danger';

export interface Toast {
  readonly id: number;
  readonly tone: ToastTone;
  readonly title: string;
  readonly detail?: string;
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

  show(tone: ToastTone, title: string, detail?: string): number {
    const id = this.nextId++;
    this.items.update((current) => [...current, { id, tone, title, detail }]);
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

  dismiss(id: number): void {
    this.items.update((current) => current.filter((toast) => toast.id !== id));
  }

  clear(): void {
    this.items.set([]);
  }
}
