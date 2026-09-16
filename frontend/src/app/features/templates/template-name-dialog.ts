import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ViewportService } from '../../core/layout/viewport.service';
import { BottomSheet } from '../../shared/ui/bottom-sheet';
import { Button } from '../../shared/ui/button';
import { Dialog } from '../../shared/ui/dialog';
import { Input } from '../../shared/ui/input';

/** Para qué se pide el nombre. Cambia el título y el texto del botón, no el formulario. */
export type NameIntent = 'create' | 'rename' | 'duplicate';

const TITLES: Record<NameIntent, string> = {
  create: 'Nueva plantilla',
  rename: 'Cambiar el nombre',
  duplicate: 'Duplicar plantilla',
};

const ACTIONS: Record<NameIntent, string> = {
  create: 'Crear',
  rename: 'Guardar',
  duplicate: 'Duplicar',
};

/**
 * Pedir un nombre de plantilla: crear, renombrar o duplicar.
 *
 * <p>Es el mismo formulario en los tres casos —un campo y un botón—, así que son el mismo
 * componente con distinto rótulo. Tres diálogos separados serían tres sitios donde arreglar
 * el mismo error de validación.
 */
@Component({
  selector: 'app-template-name-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BottomSheet, Button, Dialog, FormsModule, Input, NgTemplateOutlet],
  template: `
    <ng-template #formulario>
      <form class="flex flex-col gap-4" (ngSubmit)="submit()">
        <ui-input
          label="Nombre"
          name="nombre"
          placeholder="Compra semanal"
          autocomplete="off"
          [error]="shownError()"
          [ngModelOptions]="{ standalone: true }"
          [ngModel]="name()"
          (ngModelChange)="onType($event)" />

        @if (intent() === 'duplicate') {
          <p class="text-[13px] text-text-muted">
            Se copian todos sus productos con sus cantidades. Después podrás cambiarlos sin
            tocar la original.
          </p>
        }

        <div class="flex justify-end gap-2 pt-1">
          <ui-button variant="secondary" (pressed)="closed.emit()">Cancelar</ui-button>
          <ui-button type="submit" [loading]="saving()">{{ action() }}</ui-button>
        </div>
      </form>
    </ng-template>

    @if (isDesktop()) {
      <ui-dialog [open]="open()" [title]="title()" (closed)="closed.emit()">
        <ng-container *ngTemplateOutlet="formulario" />
      </ui-dialog>
    } @else {
      <ui-bottom-sheet [open]="open()" [title]="title()" (closed)="closed.emit()">
        <ng-container *ngTemplateOutlet="formulario" />
      </ui-bottom-sheet>
    }
  `,
  styles: `:host { display: contents; }`,
})
export class TemplateNameDialog {
  private readonly viewport = inject(ViewportService);

  readonly open = input(false);
  readonly intent = input<NameIntent>('create');
  /** Nombre de partida: el actual al renombrar, o el sugerido al duplicar. */
  readonly initial = input('');
  readonly saving = input(false);
  /** Mensaje del servidor, como un nombre ya usado. */
  readonly error = input('');

  readonly closed = output<void>();
  readonly confirmed = output<string>();

  protected readonly isDesktop = this.viewport.isDesktop;
  protected readonly name = signal('');
  protected readonly localError = signal('');

  /**
   * Lo que se pinta bajo el campo: primero lo que ve el cliente, luego lo que dijo el
   * servidor. El local gana porque es el más reciente: si el usuario borra el nombre después
   * de un «ya existe», el problema pasa a ser que está vacío.
   */
  protected readonly shownError = computed(() => this.localError() || this.error());

  protected readonly title = computed(() => TITLES[this.intent()]);
  protected readonly action = computed(() => ACTIONS[this.intent()]);

  constructor() {
    effect(() => {
      // Cada apertura parte del nombre que toque, no del que quedó la vez anterior.
      if (this.open()) {
        this.name.set(this.initial());
        this.localError.set('');
      }
    });
  }

  protected onType(value: string): void {
    this.name.set(value);
    this.localError.set('');
  }

  protected submit(): void {
    const name = this.name().trim();
    if (!name) {
      this.localError.set('Ponle un nombre para reconocerla.');
      return;
    }
    this.confirmed.emit(name);
  }
}
