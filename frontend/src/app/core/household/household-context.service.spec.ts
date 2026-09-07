import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { installLocalStorage } from '../../../testing/local-storage';
import { AuthService } from '../auth/auth.service';
import type { UserProfile } from '../auth/auth.models';
import { HouseholdContextService, LAST_HOUSEHOLD_STORAGE_KEY } from './household-context.service';
import type { HouseholdSummary } from './household.models';

@Component({ template: '' })
class Nada {}

const CASA: HouseholdSummary = { id: 'casa', name: 'Casa Rivas', role: 'ADMIN', memberCount: 3 };
const DEPA: HouseholdSummary = { id: 'depa', name: 'Depa Ñuñoa', role: 'MEMBER', memberCount: 2 };

function perfil(households: readonly HouseholdSummary[]): UserProfile {
  return {
    id: 'u1',
    email: 'ana.rivas@gmail.com',
    displayName: 'Ana Rivas',
    avatarUrl: null,
    locale: 'es-CL',
    themePreference: 'SYSTEM',
    createdAt: '2026-08-24T20:15:30Z',
    households,
  };
}

function setUp(households: readonly HouseholdSummary[]) {
  const user = signal<UserProfile | null>(perfil(households));

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'settings', component: Nada },
        { path: 'onboarding', component: Nada },
        { path: 'h/:householdId/:section', component: Nada },
      ]),
      { provide: AuthService, useValue: { user } },
    ],
  });

  return {
    router: TestBed.inject(Router),
    context: TestBed.inject(HouseholdContextService),
    user,
  };
}

describe('HouseholdContextService', () => {
  beforeEach(() => {
    installLocalStorage();
    localStorage.clear();
  });

  it('deriva el hogar activo del parámetro de la ruta', async () => {
    const { router, context } = setUp([CASA, DEPA]);

    await router.navigateByUrl('/h/depa/pantry');

    expect(context.householdId()).toBe('depa');
    expect(context.household()?.name).toBe('Depa Ñuñoa');
    expect(context.myRole()).toBe('MEMBER');
    expect(context.isAdmin()).toBe(false);
  });

  it('cambiar de hogar es navegar: no hay estado que poner a mano', async () => {
    const { router, context } = setUp([CASA, DEPA]);

    await router.navigateByUrl('/h/casa/pantry');
    expect(context.isAdmin()).toBe(true);

    await router.navigateByUrl('/h/depa/pantry');
    expect(context.isAdmin()).toBe(false);
  });

  it('fuera de /h/:householdId no hay hogar activo, y eso no es un error', async () => {
    const { router, context } = setUp([CASA]);

    await router.navigateByUrl('/settings');

    expect(context.householdId()).toBeNull();
    expect(context.household()).toBeNull();
    expect(context.myRole()).toBeNull();
  });

  it('un id que no es del usuario no produce hogar activo', async () => {
    const { router, context } = setUp([CASA]);

    await router.navigateByUrl('/h/de-otra-persona/pantry');

    expect(context.householdId()).toBe('de-otra-persona');
    expect(context.household()).toBeNull();
    expect(context.isAdmin()).toBe(false);
  });

  it('recuerda el último hogar usado', async () => {
    const { router } = setUp([CASA, DEPA]);

    await router.navigateByUrl('/h/depa/pantry');
    TestBed.tick();

    expect(localStorage.getItem(LAST_HOUSEHOLD_STORAGE_KEY)).toBe('depa');
  });

  it('no recuerda un hogar ajeno aunque se escriba en la barra de direcciones', async () => {
    const { router } = setUp([CASA]);
    localStorage.setItem(LAST_HOUSEHOLD_STORAGE_KEY, 'casa');

    await router.navigateByUrl('/h/de-otra-persona/pantry');
    TestBed.tick();

    expect(localStorage.getItem(LAST_HOUSEHOLD_STORAGE_KEY)).toBe('casa');
  });

  it('el arranque usa el hogar recordado si sigue siendo del usuario', () => {
    localStorage.setItem(LAST_HOUSEHOLD_STORAGE_KEY, 'depa');
    const { context } = setUp([CASA, DEPA]);

    expect(context.startupHouseholdId()).toBe('depa');
  });

  it('descarta el hogar recordado si ya no pertenece al usuario', () => {
    // Lo expulsaron, o el hogar se borró: lo guardado no puede mandar sobre lo real.
    localStorage.setItem(LAST_HOUSEHOLD_STORAGE_KEY, 'hogar-del-que-me-echaron');
    const { context } = setUp([CASA, DEPA]);

    expect(context.startupHouseholdId()).toBe('casa');
  });

  it('sin hogares no hay arranque posible', () => {
    localStorage.setItem(LAST_HOUSEHOLD_STORAGE_KEY, 'casa');
    const { context } = setUp([]);

    expect(context.startupHouseholdId()).toBeNull();
    expect(context.hasHouseholds()).toBe(false);
  });

  it('el chasis se rotula con el hogar de arranque cuando la ruta no lleva ninguno', async () => {
    const { router, context } = setUp([CASA, DEPA]);

    await router.navigateByUrl('/h/depa/pantry');
    TestBed.tick();
    await router.navigateByUrl('/settings');

    // En Ajustes no hay hogar activo, pero la navegación sigue sabiendo a cuál volver.
    expect(context.household()).toBeNull();
    expect(context.shellHousehold()?.id).toBe('depa');
  });

  it('roleIn responde por id, sin depender de la ruta activa', async () => {
    // Es lo que consultan los guards: durante un canActivate la señal derivada de la
    // ruta todavía apunta a la navegación anterior, así que preguntar por id es la
    // única forma correcta de saber el rol en el hogar al que se está entrando.
    const { router, context } = setUp([CASA, DEPA]);

    await router.navigateByUrl('/settings');

    expect(context.household()).toBeNull();
    expect(context.roleIn('casa')).toBe('ADMIN');
    expect(context.roleIn('depa')).toBe('MEMBER');
    expect(context.roleIn('de-otra-persona')).toBeNull();
    expect(context.roleIn(null)).toBeNull();
  });

  it('la lista de hogares sale del perfil y se actualiza con él', async () => {
    const { router, context, user } = setUp([CASA, DEPA]);
    await router.navigateByUrl('/h/depa/pantry');
    expect(context.myRole()).toBe('MEMBER');

    // El backend relee los hogares en cada refresh: si ascienden a alguien, el perfil
    // nuevo lo trae y todo lo derivado se entera solo.
    user.set(perfil([CASA, { ...DEPA, role: 'ADMIN' }]));

    expect(context.myRole()).toBe('ADMIN');
    expect(context.isAdmin()).toBe(true);
  });
});
