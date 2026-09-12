import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import type { ActivatedRouteSnapshot } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import type { HouseholdRole, HouseholdSummary } from './household.models';

/**
 * El id del hogar del que se venía la última vez. Es sólo una sugerencia de arranque
 * para no obligar a elegir al entrar en la raíz; nunca decide nada por sí misma.
 */
export const LAST_HOUSEHOLD_STORAGE_KEY = 'cellier.lastHouseholdId';

/**
 * El hogar activo, **derivado del parámetro `:householdId` de la ruta**.
 *
 * <p>No hay ningún método para «cambiar de hogar»: se cambia navegando. Esa es la
 * diferencia entre esto y una señal de estado suelta, y evita tres fallos concretos que
 * el estado en memoria provoca: dos pestañas con hogares distintos pisándose, un enlace
 * compartido que abre el hogar equivocado, y perder el contexto al recargar.
 *
 * <p>Fuera de `/h/:householdId/**` —en `/settings`, en `/onboarding`— no hay hogar
 * activo y {@link household} vale `null`. Es un estado legítimo, no un error.
 */
@Injectable({ providedIn: 'root' })
export class HouseholdContextService {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  /** El parámetro de la ruta activa. Se recalcula en cada navegación y nada más lo escribe. */
  private readonly routeHouseholdId = signal<string | null>(this.readRouteHouseholdId());

  /**
   * El último hogar usado, como señal y no como lectura suelta de localStorage, para que
   * todo lo que dependa de él se recalcule solo. El almacenamiento es la copia duradera;
   * la señal es la que consultan las vistas.
   */
  private readonly lastHouseholdId = signal<string | null>(this.readLastHouseholdId());

  /** Los hogares del usuario, tal como llegan en el perfil. */
  readonly households = computed<readonly HouseholdSummary[]>(
    () => this.auth.user()?.households ?? [],
  );

  readonly householdId = computed(() => this.routeHouseholdId());

  /**
   * El hogar activo, o `null` si la ruta no lleva ninguno **o si el que lleva no es del
   * usuario**. Un id ajeno y uno inexistente dan el mismo resultado a propósito: la
   * interfaz no puede distinguir lo que el backend se niega a distinguir.
   */
  readonly household = computed<HouseholdSummary | null>(() => {
    const id = this.householdId();
    if (id === null) {
      return null;
    }
    return this.households().find((candidate) => candidate.id === id) ?? null;
  });

  readonly myRole = computed<HouseholdRole | null>(() => this.household()?.role ?? null);

  readonly isAdmin = computed(() => this.myRole() === 'ADMIN');

  readonly hasHouseholds = computed(() => this.households().length > 0);

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.routeHouseholdId.set(this.readRouteHouseholdId()));

    // Sólo se recuerda un hogar que de verdad se está usando. Guardar el id crudo de la
    // ruta permitiría persistir uno ajeno con sólo escribirlo en la barra de direcciones.
    effect(() => {
      const active = this.household();
      if (active) {
        this.lastHouseholdId.set(active.id);
        this.writeLastHouseholdId(active.id);
      }
    });
  }

  /**
   * Por dónde empezar cuando la URL no dice nada: el último hogar usado si sigue siendo
   * del usuario, y si no el primero de la lista, que llega en orden estable desde el
   * backend. `null` si no pertenece a ninguno.
   *
   * <p>El id guardado se valida siempre contra la lista real. Si lo expulsaron o el hogar
   * se borró, el valor persistido no sobrevive a esta comprobación.
   */
  startupHouseholdId(): string | null {
    return this.startupHousehold()?.id ?? null;
  }

  /**
   * El hogar por el que empezar cuando la URL no dice nada: el último usado si sigue
   * siendo del usuario, y si no el primero de la lista, que llega en orden estable desde
   * el backend. `null` si no pertenece a ninguno.
   *
   * <p>El id recordado se valida siempre contra la lista real, así que si lo expulsaron o
   * el hogar se borró, el valor persistido no sobrevive a esta comprobación.
   */
  readonly startupHousehold = computed<HouseholdSummary | null>(() => {
    const mine = this.households();
    if (mine.length === 0) {
      return null;
    }
    const remembered = this.lastHouseholdId();
    return mine.find((candidate) => candidate.id === remembered) ?? mine[0];
  });

  /**
   * Con qué hogar rotular el chasis. Es el activo cuando la ruta lleva uno, y el de
   * arranque cuando no —en `/settings`, que es del usuario y no de ningún hogar—, para
   * que la navegación siga sabiendo a qué despensa volver.
   */
  readonly shellHousehold = computed<HouseholdSummary | null>(
    () => this.household() ?? this.startupHousehold(),
  );

  /** ¿Es este id uno de los hogares del usuario? Base de la decisión del guard. */
  isMine(householdId: string | null): boolean {
    return this.roleIn(householdId) !== null;
  }

  /**
   * El rol del usuario en un hogar concreto, preguntando por id.
   *
   * <p>**Esto es lo que deben usar los guards, no {@link myRole}.** Las señales derivadas
   * de la ruta se actualizan en `NavigationEnd`, que ocurre *después* de que corran los
   * `canActivate`: durante un guard, {@link household} todavía apunta a la navegación
   * anterior. Un guard que preguntara por ella rechazaría a una administradora legítima
   * la primera vez que entra a su propia pantalla de gestión.
   *
   * <p>En una plantilla no hay problema: para entonces la navegación ya terminó y la
   * señal es la buena.
   */
  roleIn(householdId: string | null): HouseholdRole | null {
    if (householdId === null) {
      return null;
    }
    return this.households().find((candidate) => candidate.id === householdId)?.role ?? null;
  }

  /**
   * Recorre el árbol de rutas activo hasta el nodo más profundo que declare
   * `householdId`. Se lee del árbol y no de la cadena de la URL porque el parámetro lo
   * define la configuración de rutas, no su posición en el texto.
   */
  private readRouteHouseholdId(): string | null {
    let node: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    let found: string | null = null;
    while (node) {
      const id = node.paramMap.get('householdId');
      if (id) {
        found = id;
      }
      node = node.firstChild;
    }
    return found;
  }

  private readLastHouseholdId(): string | null {
    try {
      return localStorage.getItem(LAST_HOUSEHOLD_STORAGE_KEY);
    } catch {
      // Almacenamiento bloqueado: se arranca por el primer hogar y ya está.
      return null;
    }
  }

  private writeLastHouseholdId(householdId: string): void {
    try {
      localStorage.setItem(LAST_HOUSEHOLD_STORAGE_KEY, householdId);
    } catch {
      // Sin persistencia la app funciona igual; sólo se pierde la sugerencia de arranque.
    }
  }
}
