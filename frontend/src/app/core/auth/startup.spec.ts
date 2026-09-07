import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import type { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { convertToParamMap } from '@angular/router';
import { Observable } from 'rxjs';

import { installLocalStorage } from '../../../testing/local-storage';
import { authGuard } from './auth.guard';
import { AuthService, PROFILE_LOAD_TIMEOUT_MS, REFRESH_TOKEN_STORAGE_KEY } from './auth.service';
import type { UserProfile } from './auth.models';

const PERFIL: UserProfile = {
  id: 'u1',
  email: 'ana.rivas@gmail.com',
  displayName: 'Ana Rivas',
  avatarUrl: null,
  locale: 'es-CL',
  themePreference: 'SYSTEM',
  createdAt: '2026-08-24T20:15:30Z',
  households: [{ id: 'casa', name: 'Casa Rivas', role: 'ADMIN', memberCount: 3 }],
};

function setUp({ conSesion = true } = {}) {
  installLocalStorage();
  localStorage.clear();
  if (conSesion) {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'refresh-de-prueba');
  }

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });

  return {
    auth: TestBed.inject(AuthService),
    http: TestBed.inject(HttpTestingController),
    router: TestBed.inject(Router),
  };
}

function corre(url = '/h/casa/pantry') {
  const route = { paramMap: convertToParamMap({}) } as ActivatedRouteSnapshot;
  const state = { url } as RouterStateSnapshot;
  return TestBed.runInInjectionContext(() => authGuard(route, state));
}

async function resuelve(result: unknown): Promise<boolean | UrlTree> {
  if (result instanceof Observable) {
    return await new Promise((r) => result.subscribe((v) => r(v as boolean | UrlTree)));
  }
  return result as boolean | UrlTree;
}

describe('Arranque de sesión', () => {
  it('un perfil que llega deja pasar', async () => {
    const { auth, http } = setUp();
    const pendiente = resuelve(corre());
    http.expectOne('/api/v1/me').flush(PERFIL);

    expect(await pendiente).toBe(true);
    expect(auth.user()?.households).toHaveLength(1);
  });

  it('si el servidor falla y la sesión sigue en pie, va a reconectar y NO a /login', async () => {
    // Mandar a /login sería mentir —la sesión es válida— y además crea un bucle:
    // guestGuard ve la sesión y devuelve a la raíz, que vuelve a pedir el perfil.
    const { http, router } = setUp();
    const pendiente = resuelve(corre('/h/casa/pantry'));
    http.expectOne('/api/v1/me').flush('caido', { status: 502, statusText: 'Bad Gateway' });

    const destino = router.serializeUrl((await pendiente) as UrlTree);
    expect(destino).toContain('/reconnect');
    expect(destino).toContain('redirect=%2Fh%2Fcasa%2Fpantry');
  });

  it('si el interceptor ya limpió la sesión, va a /login', async () => {
    const { auth, http, router } = setUp();
    const pendiente = resuelve(corre());
    // Un refresco fallido limpia la sesión antes de que el error llegue hasta aquí.
    auth.clearSession();
    http.expectOne('/api/v1/me').flush('no', { status: 401, statusText: 'Unauthorized' });

    expect(router.serializeUrl((await pendiente) as UrlTree)).toContain('/login');
  });

  it('un servidor que no responde se corta por timeout en vez de esperar para siempre', () => {
    // Con relojes simulados: el caso tarda diez segundos de reloj real y no hay ninguna
    // razón para que la suite los espere.
    vi.useFakeTimers();
    try {
      const { auth, http } = setUp();
      let resultado: UserProfile | null | undefined;
      auth.ensureProfileLoaded().subscribe((p) => (resultado = p));

      // La petición se abre y nunca se responde: es el caso que ningún catchError cubre,
      // porque no hay error que capturar.
      http.expectOne('/api/v1/me');

      vi.advanceTimersByTime(PROFILE_LOAD_TIMEOUT_MS - 1);
      expect(resultado).toBeUndefined();

      vi.advanceTimersByTime(2);
      expect(resultado).toBeNull();
      expect(auth.isProfileUnreachable()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tras un fallo no se repite la espera: responde en el acto', async () => {
    const { auth, http } = setUp();
    auth.ensureProfileLoaded().subscribe();
    http.expectOne('/api/v1/me').flush('caido', { status: 502, statusText: 'Bad Gateway' });
    expect(auth.isProfileUnreachable()).toBe(true);

    let segundo: UserProfile | null | undefined;
    auth.ensureProfileLoaded().subscribe((p) => (segundo = p));

    // Ni una petición más, y respuesta inmediata: el guard puede enseñar la pantalla de
    // reconexión sin encadenar un segundo timeout.
    http.expectNone('/api/v1/me');
    expect(segundo).toBeNull();
  });

  it('reintentar vuelve a pedirlo y recupera la sesión', async () => {
    const { auth, http } = setUp();
    auth.ensureProfileLoaded().subscribe();
    http.expectOne('/api/v1/me').flush('caido', { status: 502, statusText: 'Bad Gateway' });

    let recuperado: UserProfile | null | undefined;
    auth.retryProfileLoad().subscribe((p) => (recuperado = p));
    http.expectOne('/api/v1/me').flush(PERFIL);

    expect(recuperado?.displayName).toBe('Ana Rivas');
    expect(auth.isProfileUnreachable()).toBe(false);
  });

  it('sin sesión no se pide nada y se va a /login', async () => {
    const { http, router } = setUp({ conSesion: false });
    const destino = await resuelve(corre('/h/casa/pantry'));

    http.expectNone('/api/v1/me');
    expect(router.serializeUrl(destino as UrlTree)).toContain('/login');
  });

  it('un fallo de red conserva la sesión: no se echa a nadie por un 502', async () => {
    const { auth, http } = setUp();
    auth.ensureProfileLoaded().subscribe();
    http.expectOne('/api/v1/me').flush('caido', { status: 502, statusText: 'Bad Gateway' });

    // Lo contrario sería borrar el refresh token por una caída del servidor y obligar a
    // volver a entrar con Google cuando la sesión nunca dejó de ser válida.
    expect(auth.isAuthenticated()).toBe(true);
    expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBe('refresh-de-prueba');
  });
});
