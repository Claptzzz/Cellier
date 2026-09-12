import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Router, convertToParamMap } from '@angular/router';
import { Observable, of } from 'rxjs';
import { signal } from '@angular/core';

import { ToastService } from '../toast/toast.service';
import { HouseholdContextService } from './household-context.service';
import { householdAdminGuard, householdGuard } from './household.guard';
import type { HouseholdSummary } from './household.models';
import { MyJoinRequestsService } from './my-join-requests.service';

const CASA: HouseholdSummary = { id: 'casa', name: 'Casa Rivas', role: 'ADMIN', memberCount: 3 };
const DEPA: HouseholdSummary = { id: 'depa', name: 'Depa Ñuñoa', role: 'MEMBER', memberCount: 2 };

/** Un hogar que sí existe en el servidor, pero del que este usuario no es miembro. */
const AJENO = 'hogar-de-otra-persona';

/** Un identificador con forma válida que no corresponde a ningún hogar. */
const INEXISTENTE = 'no-existe-en-ninguna-parte';

function setUp(options: { households: readonly HouseholdSummary[]; pending?: boolean }) {
  const households = signal(options.households);

  /**
   * El doble expone `roleIn` y NO `isAdmin`, igual que el servicio real de cara a los
   * guards. La diferencia importa: `isAdmin()` se deriva de la ruta activa, que durante
   * un `canActivate` todavía apunta a la navegación anterior. Un doble que ofreciera
   * `isAdmin` dejaría pasar un guard escrito con ese error.
   */
  const context = {
    households,
    hasHouseholds: () => households().length > 0,
    roleIn: (id: string | null) => households().find((h) => h.id === id)?.role ?? null,
    isMine: (id: string | null) => id !== null && households().some((h) => h.id === id),
    startupHouseholdId: () => households()[0]?.id ?? null,
  };

  const myRequests = {
    ensureLoaded: () => of([]),
    hasPending: () => options.pending ?? false,
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: HouseholdContextService, useValue: context },
      { provide: MyJoinRequestsService, useValue: myRequests },
    ],
  });
  return TestBed.inject(Router);
}

function run(householdId: string | null, url = `/h/${householdId}/pantry`) {
  const route = { paramMap: convertToParamMap(householdId ? { householdId } : {}) } as ActivatedRouteSnapshot;
  const state = { url } as RouterStateSnapshot;
  return TestBed.runInInjectionContext(() => householdGuard(route, state));
}

/** El guard devuelve o un valor directo o un Observable; esto normaliza ambos. */
async function settle(result: unknown): Promise<boolean | UrlTree> {
  if (result instanceof Observable) {
    return await new Promise((resolve) => result.subscribe((value) => resolve(value as boolean | UrlTree)));
  }
  return result as boolean | UrlTree;
}

describe('householdGuard', () => {
  it('deja pasar cuando el hogar de la URL es del usuario', async () => {
    setUp({ households: [CASA, DEPA] });
    expect(await settle(run('casa'))).toBe(true);
  });

  it('sin hogares y sin solicitudes, lleva a la bienvenida', async () => {
    const router = setUp({ households: [], pending: false });
    const result = await settle(run('casa'));
    expect(router.serializeUrl(result as UrlTree)).toBe('/onboarding');
  });

  it('sin hogares pero CON una solicitud pendiente, lleva a la sala de espera', async () => {
    // El tercer estado: ya hizo lo único que podía hacer. Enseñarle «crea tu primer
    // hogar» le diría que su solicitud se perdió.
    const router = setUp({ households: [], pending: true });
    const result = await settle(run('casa'));
    expect(router.serializeUrl(result as UrlTree)).toBe('/onboarding/pending');
  });

  it('con hogares, un id ajeno lleva a uno propio conservando la sección', async () => {
    const router = setUp({ households: [CASA, DEPA] });
    const result = await settle(run(AJENO, `/h/${AJENO}/templates`));
    expect(router.serializeUrl(result as UrlTree)).toBe('/h/casa/templates');
  });

  it('un hogar ajeno y uno inexistente son indistinguibles: mismo destino y mismo aviso', async () => {
    // Si el destino o el aviso difirieran, probar identificadores permitiría deducir
    // cuáles existen. Es la misma razón por la que el backend responde 404 a los dos.
    const ajeno = await destinoYAviso(AJENO);
    const inexistente = await destinoYAviso(INEXISTENTE);

    expect(ajeno).toEqual(inexistente);
  });

  it('el aviso repite el texto del backend, sin explicar cuál de los dos motivos fue', async () => {
    const { aviso } = await destinoYAviso(AJENO);

    expect(aviso).toEqual({
      tone: 'warn',
      title: 'No existe ese hogar, o ya no perteneces a él.',
      detail: 'Te llevamos a uno de tus hogares.',
    });
  });

  /** Ejecuta el guard en un contexto limpio y devuelve a dónde manda y qué avisa. */
  async function destinoYAviso(householdId: string) {
    const router = setUp({ households: [CASA] });
    const toast = TestBed.inject(ToastService);
    toast.clear();

    const destino = router.serializeUrl((await settle(run(householdId))) as UrlTree);
    const [primero] = toast.toasts();

    return {
      destino,
      aviso: primero
        ? { tone: primero.tone, title: primero.title, detail: primero.detail }
        : null,
    };
  }

  it('sin sección reconocible en la URL, cae en la despensa', async () => {
    const router = setUp({ households: [CASA] });
    const result = await settle(run(AJENO, `/h/${AJENO}`));
    expect(router.serializeUrl(result as UrlTree)).toBe('/h/casa/pantry');
  });
});

describe('householdAdminGuard', () => {
  function runAdmin(householdId: string) {
    const route = { paramMap: convertToParamMap({ householdId }) } as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(() => householdAdminGuard(route, {} as RouterStateSnapshot));
  }

  it('deja pasar a un administrador', () => {
    setUp({ households: [CASA] });
    expect(runAdmin('casa')).toBe(true);
  });

  it('a un miembro sin rol lo devuelve a la sección del hogar, no lo oculta', () => {
    // Aquí sí sabe que el hogar existe: es miembro. No hay nada que esconderle, así que
    // el destino es su propio hogar y no un 404.
    const router = setUp({ households: [DEPA] });
    const result = runAdmin('depa');
    expect(router.serializeUrl(result as UrlTree)).toBe('/h/depa/home');
  });

  it('resuelve el rol por el id de SU ruta, no por el hogar activo', () => {
    // Con los dos hogares en la lista, el guard debe mirar el que pide la URL. Si mirara
    // una señal derivada de la navegación anterior, entrar a la gestión del hogar que
    // administras te rebotaría la primera vez.
    setUp({ households: [DEPA, CASA] });

    expect(runAdmin('casa')).toBe(true);
    expect(runAdmin('depa')).not.toBe(true);
  });
});
