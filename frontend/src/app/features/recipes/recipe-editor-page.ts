import { NgTemplateOutlet } from '@angular/common';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { HouseholdContextService } from '../../core/household/household-context.service';
import { RecipeEditorStore } from '../../core/recipes/recipe-editor-store';
import type { DraftIngredient } from '../../core/recipes/recipe-editor-store';
import { unitLabel } from '../../core/pantry/pantry.models';
import { ToastService } from '../../core/toast/toast.service';
import { ViewportService } from '../../core/layout/viewport.service';
import type { ConfirmsLeaving } from '../templates/unsaved-changes.guard';
import { BottomSheet } from '../../shared/ui/bottom-sheet';
import { Button } from '../../shared/ui/button';
import { Dialog } from '../../shared/ui/dialog';
import { EmptyState } from '../../shared/ui/empty-state';
import { Icon } from '../../shared/ui/icon';
import { IconButton } from '../../shared/ui/icon-button';
import { Input } from '../../shared/ui/input';
import { Skeleton } from '../../shared/ui/skeleton';
import { RecipeIngredientPicker } from './recipe-ingredient-picker';
import type { IngredientChosen } from './recipe-ingredient-picker';

/**
 * Crear o editar una receta. Un solo store para las dos rutas: {@link RecipeEditorStore}
 * decide con `startCreate` o `load` según si la ruta trae `:recipeId`.
 *
 * <p>El guardado es explícito, con un solo PUT/POST del payload completo —receta,
 * ingredientes y pasos juntos, igual que las plantillas guardan su lista entera—. Salir con
 * cambios sin guardar pide confirmación: `askToLeave()` lo implementa este componente para
 * `unsavedChangesGuard`, que vive en la ruta porque sólo el router sabe que alguien navega.
 *
 * <p>Los pasos se reordenan arrastrando —`@angular/cdk/drag-drop`— o con los botones
 * subir/bajar: arrastrar en móvil es frágil, y no es accesible por teclado. Las dos vías
 * llaman a `store.moveStep`, que es el mismo cambio visto de dos maneras.
 */
@Component({
  selector: 'app-recipe-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // RecipeEditorStore es @Injectable() sin providedIn: cada visita al editor —crear o
  // editar— necesita su propio borrador, no uno compartido entre navegaciones.
  providers: [RecipeEditorStore],
  imports: [
    BottomSheet, Button, CdkDrag, CdkDragHandle, CdkDropList, Dialog, EmptyState, FormsModule,
    Icon, IconButton, Input, NgTemplateOutlet, RecipeIngredientPicker, Skeleton,
  ],
  template: `
    @if (store.isLoading()) {
      <div class="mx-auto flex w-full max-w-2xl flex-col gap-3 pb-4" aria-busy="true">
        <ui-skeleton width="40%" height="20px" label="Cargando la receta" />
        <ui-skeleton width="100%" height="200px" />
      </div>
    } @else if (store.hasError()) {
      <ui-empty-state icon="warning-circle" title="No pudimos cargar la receta"
        description="Puede ser la conexión.">
        <ui-button icon="arrow-left" (pressed)="cancel()">Volver</ui-button>
      </ui-empty-state>
    } @else {
      <!-- pb grande a propósito: tiene que dejar hueco para la barra fija DE ABAJO Y la
           navegación inferior en móvil, que están apiladas, no superpuestas. -->
      <form class="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-40 lg:pb-24" (ngSubmit)="save()">
        <div class="flex items-center justify-between gap-3">
          <h1 class="font-display text-[22px] font-semibold tracking-tight text-text">
            {{ store.isNew() ? 'Nueva receta' : 'Editar receta' }}
          </h1>
        </div>

        <!-- ============ DATOS GENERALES ============ -->
        <section class="flex flex-col gap-4">
          <ui-input
            label="Nombre"
            name="nombre"
            placeholder="Tarta de manzana"
            autocomplete="off"
            [error]="nameError()"
            [ngModelOptions]="{ standalone: true }"
            [ngModel]="store.name()"
            (ngModelChange)="store.setName($event)" />

          <div class="flex flex-col gap-1.5">
            <label for="descripcion" class="text-[13px] font-medium text-text">
              Descripción <span class="font-normal text-text-muted">(opcional)</span>
            </label>
            <textarea id="descripcion" name="descripcion" rows="3"
              class="w-full resize-y rounded-sm border border-border-strong bg-surface-raised
                     px-3 py-2 text-[length:var(--text-control)] text-text
                     placeholder:text-text-muted
                     focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              placeholder="Clásica, con canela y un toque de limón."
              [ngModelOptions]="{ standalone: true }"
              [ngModel]="store.description()"
              (ngModelChange)="store.setDescription($event)"></textarea>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <ui-input
              label="Raciones"
              name="raciones"
              type="text"
              inputMode="numeric"
              autocomplete="off"
              [required]="false"
              [error]="servingsError()"
              [ngModelOptions]="{ standalone: true }"
              [ngModel]="servingsText()"
              (ngModelChange)="onServingsChange($event)" />
            <ui-input
              label="Minutos de preparación"
              name="minutos"
              type="text"
              inputMode="numeric"
              autocomplete="off"
              [required]="false"
              [error]="prepMinutesError()"
              [ngModelOptions]="{ standalone: true }"
              [ngModel]="prepMinutesText()"
              (ngModelChange)="onPrepMinutesChange($event)" />
          </div>
        </section>

        <!-- ============ INGREDIENTES ============ -->
        <section class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h2 class="text-[13px] font-medium text-text-muted">Ingredientes</h2>
            <ui-button variant="secondary" size="sm" icon="plus" (pressed)="pickingIngredient.set(true)">
              Añadir
            </ui-button>
          </div>

          @if (store.ingredients().length === 0) {
            <p class="rounded-md border border-dashed border-border p-4 text-[13px] text-text-muted">
              Sin ingredientes todavía. Una receta a medias es un borrador legítimo.
            </p>
          } @else {
            <ul class="flex list-none flex-col gap-2 p-0">
              @for (ingrediente of store.ingredients(); track ingrediente.key) {
                <li class="flex items-center justify-between gap-3 rounded-md border
                           border-border bg-surface-raised p-3">
                  <div class="min-w-0">
                    <span class="block truncate text-[14px] text-text">{{ ingrediente.productName }}</span>
                    <span class="text-[12px] text-text-muted">
                      {{ ingrediente.quantity }} {{ unitLabel(ingrediente.unit) }}
                      @if (ingrediente.optional) { · Opcional }
                    </span>
                  </div>
                  <ui-icon-button name="trash" label="Quitar {{ ingrediente.productName }}"
                    (pressed)="removeIngredient(ingrediente)" />
                </li>
              }
            </ul>
          }
        </section>

        <!-- ============ PASOS ============ -->
        <section class="flex flex-col gap-2">
          <h2 class="text-[13px] font-medium text-text-muted">Pasos</h2>

          @if (store.steps().length === 0) {
            <p class="rounded-md border border-dashed border-border p-4 text-[13px] text-text-muted">
              Sin pasos todavía.
            </p>
          } @else {
            <ul cdkDropList class="flex list-none flex-col gap-2 p-0" (cdkDropListDropped)="onStepDrop($event)">
              @for (paso of store.steps(); track $index) {
                <li cdkDrag class="flex items-start gap-2 rounded-md border border-border
                                   bg-surface-raised p-3">
                  <button cdkDragHandle type="button" aria-label="Arrastrar para reordenar"
                    class="mt-1 flex min-h-[var(--touch-min)] min-w-[32px] flex-none cursor-grab
                           items-center justify-center text-text-muted hover:text-text
                           focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                    <ui-icon name="dots-three" [size]="18" />
                  </button>
                  <span class="mt-2 flex h-6 w-6 flex-none items-center justify-center rounded-full
                               bg-accent-weak text-[12px] font-semibold text-accent">
                    {{ $index + 1 }}
                  </span>
                  <textarea rows="2"
                    class="flex-1 resize-y rounded-sm border border-border-strong bg-surface
                           px-2.5 py-2 text-[length:var(--text-control)] text-text
                           focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                    [ngModelOptions]="{ standalone: true }"
                    [ngModel]="paso"
                    (ngModelChange)="store.setStepText($index, $event)"></textarea>
                  <div class="flex flex-none flex-col">
                    <ui-icon-button name="caret-down" label="Subir paso" class="rotate-180"
                      [disabled]="$index === 0" (pressed)="store.moveStep($index, $index - 1)" />
                    <ui-icon-button name="caret-down" label="Bajar paso"
                      [disabled]="$index === store.steps().length - 1"
                      (pressed)="store.moveStep($index, $index + 1)" />
                  </div>
                  <ui-icon-button name="trash" label="Quitar paso {{ $index + 1 }}"
                    (pressed)="store.removeStep($index)" />
                </li>
              }
            </ul>
          }

          <div class="flex gap-2">
            <ui-input label="Nuevo paso" name="nuevoPaso" autocomplete="off" [required]="false"
              placeholder="Batir los huevos…"
              [ngModelOptions]="{ standalone: true }"
              [ngModel]="newStep()"
              (ngModelChange)="newStep.set($event)" />
            <div class="flex items-end pb-1.5">
              <ui-button variant="secondary" icon="plus" (pressed)="addStep()">Añadir</ui-button>
            </div>
          </div>
        </section>

        @if (store.error()) {
          <p class="rounded-sm bg-danger-weak px-3 py-2.5 text-[13px] text-danger" role="alert">
            {{ store.error() }}
          </p>
        }

        <!-- Barra fija: guardar y cancelar siempre al alcance, sin perseguir el scroll.
             En móvil se ancla ENCIMA de la navegación inferior, no debajo: las dos son
             fixed/bottom-0, y con la navegación a z-40 le tapaba los toques a "Cancelar"
             aunque se viera clicable. En escritorio no hay navegación inferior que evitar. -->
        <div class="fixed inset-x-0 z-30 border-t border-border bg-surface-raised px-4 py-3 lg:bottom-0"
          style="bottom: calc(var(--bottom-nav-h) + env(safe-area-inset-bottom));">
          <div class="mx-auto flex max-w-2xl justify-end gap-2">
            <ui-button variant="secondary" type="button" (pressed)="cancel()">Cancelar</ui-button>
            <ui-button type="submit" [loading]="store.isSaving()">Guardar</ui-button>
          </div>
        </div>
      </form>
    }

    @if (householdId(); as householdId) {
      <app-recipe-ingredient-picker
        [open]="pickingIngredient()"
        [householdId]="householdId"
        (closed)="pickingIngredient.set(false)"
        (chosen)="onIngredientChosen($event)" />
    }

    <!-- ============ SALIR SIN GUARDAR ============ -->
    <ng-template #confirmarSalida>
      <p class="mb-4 text-[14px] text-text-muted">
        Tienes cambios sin guardar en esta receta. Si sales ahora, se pierden.
      </p>
      <div class="flex justify-end gap-2">
        <ui-button variant="secondary" (pressed)="resolveLeave(false)">Seguir editando</ui-button>
        <ui-button variant="danger" (pressed)="resolveLeave(true)">Salir sin guardar</ui-button>
      </div>
    </ng-template>

    @if (isDesktop()) {
      <ui-dialog title="¿Salir sin guardar?" [open]="asking()" (closed)="resolveLeave(false)">
        <ng-container [ngTemplateOutlet]="confirmarSalida" />
      </ui-dialog>
    } @else {
      <ui-bottom-sheet title="¿Salir sin guardar?" [open]="asking()" (closed)="resolveLeave(false)">
        <ng-container [ngTemplateOutlet]="confirmarSalida" />
      </ui-bottom-sheet>
    }
  `,
  styles: `:host { display: block; }`,
})
export class RecipeEditorPage implements ConfirmsLeaving {
  protected readonly store = inject(RecipeEditorStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly householdId = inject(HouseholdContextService).householdId;
  protected readonly isDesktop = inject(ViewportService).isDesktop;

  protected readonly pickingIngredient = signal(false);
  protected readonly newStep = signal('');
  protected readonly nameError = signal('');
  protected readonly servingsError = signal('');
  protected readonly prepMinutesError = signal('');
  protected readonly asking = signal(false);

  protected readonly servingsText = computed(() => this.store.servings()?.toString() ?? '');
  protected readonly prepMinutesText = computed(() => this.store.prepMinutes()?.toString() ?? '');

  private leaveDecision: ((leave: boolean) => void) | null = null;

  constructor() {
    const recipeId = this.route.snapshot.paramMap.get('recipeId');
    const householdId = this.householdId();
    if (householdId) {
      if (recipeId) {
        this.store.load(householdId, recipeId);
      } else {
        this.store.startCreate(householdId);
      }
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (this.store.isDirty()) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    this.destroyRef.onDestroy(() => window.removeEventListener('beforeunload', onBeforeUnload));
  }

  /** Lo que pide `unsavedChangesGuard`: sólo el router sabe que alguien está navegando. */
  askToLeave(): Promise<boolean> {
    if (!this.store.isDirty()) {
      return Promise.resolve(true);
    }
    this.asking.set(true);
    return new Promise<boolean>((resolve) => {
      this.leaveDecision = resolve;
    });
  }

  protected resolveLeave(leave: boolean): void {
    this.asking.set(false);
    this.leaveDecision?.(leave);
    this.leaveDecision = null;
  }

  protected onServingsChange(text: string): void {
    this.servingsError.set('');
    if (text.trim() === '') {
      this.store.setServings(null);
      return;
    }
    const value = Number.parseInt(text, 10);
    if (Number.isNaN(value) || value <= 0) {
      this.servingsError.set('Tiene que ser mayor que cero.');
      return;
    }
    this.store.setServings(value);
  }

  protected onPrepMinutesChange(text: string): void {
    this.prepMinutesError.set('');
    if (text.trim() === '') {
      this.store.setPrepMinutes(null);
      return;
    }
    const value = Number.parseInt(text, 10);
    if (Number.isNaN(value) || value <= 0) {
      this.prepMinutesError.set('Tiene que ser mayor que cero.');
      return;
    }
    this.store.setPrepMinutes(value);
  }

  protected onIngredientChosen(picked: IngredientChosen): void {
    if (picked.product) {
      this.store.addExistingIngredient(picked.product, picked.quantity, picked.optional);
    } else {
      this.store.addNewIngredient(picked.name, picked.unit, picked.quantity, picked.optional);
    }
  }

  protected removeIngredient(ingredient: DraftIngredient): void {
    const removed = this.store.removeIngredient(ingredient.key);
    if (!removed) {
      return;
    }
    this.toasts.show('info', `Quitaste ${removed.item.productName}`, undefined, {
      label: 'Deshacer',
      run: () => this.store.restoreIngredient(removed.item, removed.index),
    });
  }

  protected addStep(): void {
    const text = this.newStep().trim();
    if (!text) {
      return;
    }
    this.store.addStep(text);
    this.newStep.set('');
  }

  protected onStepDrop(event: CdkDragDrop<unknown>): void {
    this.store.moveStep(event.previousIndex, event.currentIndex);
  }

  protected cancel(): void {
    void this.router.navigate(['../'], { relativeTo: this.route });
  }

  protected save(): void {
    this.nameError.set(this.store.name().trim() ? '' : 'Escribe el nombre de la receta.');
    if (this.nameError()) {
      return;
    }

    const wasNew = this.store.isNew();
    this.store.save((saved) => {
      const householdId = this.householdId();
      if (householdId) {
        void this.router.navigate(['/h', householdId, 'recipes', saved.id]);
      }
      this.toasts.success(wasNew ? 'Receta guardada' : 'Receta actualizada', `«${saved.name}»`);
    });
  }

  protected readonly unitLabel = unitLabel;
}
