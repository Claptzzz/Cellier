import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';

import { HealthService } from './core/health.service';

interface Badge {
  readonly label: string;
  readonly classes: string;
  readonly dot: string;
}

interface Field {
  readonly term: string;
  readonly value: string;
}

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  private readonly healthService = inject(HealthService);

  protected readonly health = this.healthService.health;

  /** Campos de la respuesta, listos para pintar; vacío si aún no hay respuesta. */
  protected readonly fields = computed<readonly Field[]>(() => {
    const state = this.health();
    if (state.kind !== 'ok') {
      return [];
    }
    return [
      { term: 'status', value: state.payload.status },
      { term: 'service', value: state.payload.service },
    ];
  });

  /** Mensaje de error, o cadena vacía si el último sondeo no falló. */
  protected readonly errorMessage = computed(() => {
    const state = this.health();
    return state.kind === 'error' ? state.message : '';
  });

  protected readonly badge = computed<Badge>(() => {
    switch (this.health().kind) {
      case 'ok':
        return {
          label: 'Conectado',
          classes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
          dot: 'bg-emerald-500',
        };
      case 'error':
        return {
          label: 'Sin conexión',
          classes: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
          dot: 'bg-rose-500',
        };
      default:
        return {
          label: 'Comprobando',
          classes: 'bg-slate-200 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300',
          dot: 'bg-slate-400 animate-pulse',
        };
    }
  });

  ngOnInit(): void {
    this.healthService.check();
  }

  protected retry(): void {
    this.healthService.check();
  }
}
