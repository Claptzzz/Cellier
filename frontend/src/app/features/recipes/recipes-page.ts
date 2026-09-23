import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { HouseholdContextService } from '../../core/household/household-context.service';
import { RecipeStore } from '../../core/recipes/recipe-store';
import type { RecipeAvailabilityFilter, RecipeSummary } from '../../core/recipes/recipe.models';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { EmptyState } from '../../shared/ui/empty-state';
import { Input } from '../../shared/ui/input';
import { SegmentedControl } from '../../shared/ui/segmented-control';
import { Skeleton } from '../../shared/ui/skeleton';
import type { SegmentOption } from '../../shared/ui/segmented-control';
import type { BadgeTone } from '../../shared/ui/badge';

const FILTERS: readonly SegmentOption[] = [
  { value: 'ALL', label: 'Todas' },
  { value: 'READY', label: 'Puedo cocinarla' },
  { value: 'MISSING', label: 'Me faltan' },
];

/** Cuántas tarjetas falsas se pintan mientras carga. */
const SKELETON_CARDS = 4;

function isFilter(value: string | null): value is RecipeAvailabilityFilter {
  return value === 'ALL' || value === 'READY' || value === 'MISSING';
}

/**
 * El recetario del hogar.
 *
 * <p>Tres filtros siempre visibles —no un desplegable— y un buscador, los dos resueltos en
 * el servidor y reflejados en la URL: quien comparte el enlace comparte también lo que
 * estaba viendo. Es el primer sitio de la app con filtros en la URL; ver el comentario del
 * constructor para el porqué de cómo se sincronizan.
 *
 * <p>Cuatro estados vacíos, y NO son el mismo mensaje con otro icono: un recetario sin
 * ninguna receta, un filtro «puedo cocinarla» sin ninguna que alcance, un filtro «me faltan»
 * sin ninguna que falte —que es una buena noticia—, y una búsqueda que no encuentra nada.
 * Confundirlos le diría a alguien que no tiene recetas cuando lo que pasa es que ninguna
 * está lista hoy.
 */
@Component({
  selector: 'app-recipes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, Button, EmptyState, FormsModule, Input, RouterLink, SegmentedControl, Skeleton],
  template: `
    <div class="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-4">

      <!-- ============ FILTROS ============
           Pegados arriba, igual que en la despensa: es la pantalla que se consulta de pie,
           decidiendo qué cocinar, y volver al buscador no debería costar un scroll entero. -->
      @if (showFilters()) {
        <div class="sticky top-[var(--header-h)] z-30 flex flex-col gap-3 bg-surface pb-2 pt-2">
          <ui-segmented-control
            ariaLabel="Filtrar por disponibilidad"
            [options]="FILTERS"
            [value]="store.availability()"
            (valueChange)="setAvailability($event)" />

          <ui-input
            label="Buscar recetas"
            type="search"
            icon="magnifying-glass"
            placeholder="Tarta de manzana, tortilla…"
            autocomplete="off"
            [required]="false"
            [ngModel]="store.search()"
            (ngModelChange)="store.search.set($event)" />
        </div>
      }

      <!-- ============ CONTENIDO ============ -->
      @if (store.loadingFirstTime()) {
        <div class="flex flex-col gap-2" aria-busy="true">
          @for (tarjeta of skeletonCards; track tarjeta) {
            <div class="flex min-h-[84px] flex-col justify-center gap-2 rounded-lg border
                        border-border bg-surface-raised p-4">
              <ui-skeleton width="60%" height="16px" label="Cargando las recetas" />
              <ui-skeleton width="40%" height="13px" />
            </div>
          }
        </div>
      } @else if (store.hasError()) {
        <ui-empty-state icon="warning-circle" title="No pudimos cargar las recetas"
          description="Puede ser la conexión. Lo que tengas guardado sigue a salvo.">
          <ui-button icon="arrows-clockwise" (pressed)="store.reload()">Reintentar</ui-button>
        </ui-empty-state>
      } @else if (store.isEmpty()) {
        <ui-empty-state icon="fork-knife" title="Sin recetas"
          description="Guarda recetas y Cellier te dirá qué ingredientes ya tienes en la despensa.">
          <ui-button icon="plus" link="new">Crear la primera</ui-button>
        </ui-empty-state>
      } @else if (store.noneReady()) {
        <ui-empty-state icon="hourglass-medium" title="Ninguna lista para cocinar todavía"
          description="Con lo que hay ahora en la despensa, ninguna receta te alcanza entera.">
          <ui-button variant="secondary" icon="warning" (pressed)="setAvailability('MISSING')">
            Ver qué falta
          </ui-button>
        </ui-empty-state>
      } @else if (store.noneMissing()) {
        <ui-empty-state icon="check-circle" title="Nada te falta"
          description="Todo lo que tienes guardado se puede cocinar con lo que hay en la despensa." />
      } @else if (store.noSearchMatches()) {
        <ui-empty-state icon="magnifying-glass" title="Nada encaja con esa búsqueda">
          <ui-button variant="secondary" (pressed)="store.clearSearch()">Quitar búsqueda</ui-button>
        </ui-empty-state>
      } @else {
        <div class="flex justify-end">
          <ui-button icon="plus" link="new">Nueva receta</ui-button>
        </div>
        <ul class="flex list-none flex-col gap-2 p-0" [attr.aria-busy]="store.refreshing() ? 'true' : null">
          @for (receta of store.recipes(); track receta.id) {
            <li>
              <a [routerLink]="[receta.id]"
                class="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-4
                       shadow-e1 transition-colors hover:bg-surface-sunken
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <div class="flex items-start justify-between gap-3">
                  <span class="min-w-0 truncate text-[15px] font-medium text-text">{{ receta.name }}</span>
                  <ui-badge [tone]="badgeTone(receta)">{{ badgeLabel(receta) }}</ui-badge>
                </div>
                <span class="text-[13px] text-text-muted">
                  {{ receta.ingredientCount }} ingrediente{{ receta.ingredientCount === 1 ? '' : 's' }}
                  @if (receta.createdByName) {
                    · {{ receta.createdByName }}
                  }
                </span>
              </a>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `:host { display: block; }`,
})
export class RecipesPage {
  protected readonly store = inject(RecipeStore);
  protected readonly householdId = inject(HouseholdContextService).householdId;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly FILTERS = FILTERS;
  protected readonly skeletonCards = Array.from({ length: SKELETON_CARDS }, (_, i) => i);

  protected readonly showFilters = () => !this.store.isEmpty() && !this.store.hasError();

  constructor() {
    // Semilla inicial: lo que traiga la URL manda sobre el estado por defecto del store.
    // Una lectura del snapshot basta, porque esta página no se reutiliza entre navegaciones
    // con querystrings distintas sin volver a construirse.
    const params = this.route.snapshot.queryParamMap;
    const availability = params.get('availability');
    if (isFilter(availability)) {
      this.store.availability.set(availability);
    }
    const search = params.get('search');
    if (search) {
      this.store.search.set(search);
    }

    // La URL refleja el filtro buscado y aplicado, no cada tecla: por eso lee
    // `appliedSearch` (ya con el debounce cumplido) y no `search`. `replaceUrl` evita que
    // cada toque del segmento o cada búsqueda deje una entrada nueva en el historial —
    // "atrás" tendría que deshacer treinta filtros antes de salir de la pantalla.
    effect(() => {
      const availability = this.store.availability();
      const search = this.store.appliedSearch();
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          availability: availability === 'ALL' ? null : availability,
          search: search || null,
        },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });
  }

  protected setAvailability(value: string): void {
    if (isFilter(value)) {
      this.store.availability.set(value);
    }
  }

  protected badgeTone(recipe: RecipeSummary): BadgeTone {
    return recipe.availability === 'READY' ? 'ok' : 'warn';
  }

  /**
   * `MISSING` sin faltantes no es un caso raro que se pueda ignorar: es una receta sin
   * ningún ingrediente obligatorio todavía —recién creada, o con todo marcado opcional—
   * (R1 en docs/reglas-recetas.md). «Faltan 0 ingredientes» sería falso: no falta nada
   * porque no se ha dicho qué hace falta.
   */
  protected badgeLabel(recipe: RecipeSummary): string {
    if (recipe.availability === 'READY') {
      return 'Puedes cocinarla';
    }
    if (recipe.missingCount === 0) {
      return 'Sin ingredientes obligatorios';
    }
    return recipe.missingCount === 1 ? 'Falta 1 ingrediente' : `Faltan ${recipe.missingCount} ingredientes`;
  }
}
