import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { installLocalStorage } from '../../../testing/local-storage';
import { authInterceptor, resetAuthInterceptorState } from './auth.interceptor';
import { AuthService, REFRESH_TOKEN_STORAGE_KEY } from './auth.service';

/** Respuesta de /auth/refresh con tokens distinguibles por sufijo. */
function authResponse(suffix: string) {
  return {
    accessToken: `access-${suffix}`,
    refreshToken: `refresh-${suffix}`,
    expiresIn: 900,
    user: {
      id: '3f1c9a2e-5b7d-4a10-9c88-2f0e6b4d1a73',
      email: 'ana.rivas@gmail.com',
      displayName: 'Ana Rivas',
      avatarUrl: null,
      locale: 'es-CL',
      themePreference: 'SYSTEM' as const,
      createdAt: '2026-08-24T20:15:30Z',
    },
  };
}

describe('authInterceptor', () => {
  let http: HttpClient;
  let mock: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    installLocalStorage();
    localStorage.clear();
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'refresh-inicial');
    resetAuthInterceptorState();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([{ path: "login", children: [] }]),
      ],
    });

    http = TestBed.inject(HttpClient);
    mock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => mock.verify());

  it('no pone Authorization en las rutas de auth', () => {
    http.post('/api/v1/auth/refresh', {}).subscribe();

    const req = mock.expectOne('/api/v1/auth/refresh');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('agrega el Bearer cuando hay access token', () => {
    auth['accessTokenSignal'].set('access-vivo');

    http.get('/api/v1/me').subscribe();

    const req = mock.expectOne('/api/v1/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-vivo');
    req.flush({});
  });

  it('ante un 401 refresca una vez y reintenta con el token nuevo', () => {
    auth['accessTokenSignal'].set('access-caducado');
    let recibido: unknown = null;

    http.get('/api/v1/me').subscribe((r) => (recibido = r));

    mock.expectOne('/api/v1/me').flush(null, { status: 401, statusText: 'Unauthorized' });

    mock.expectOne('/api/v1/auth/refresh').flush(authResponse('nuevo'));

    const reintento = mock.expectOne('/api/v1/me');
    expect(reintento.request.headers.get('Authorization')).toBe('Bearer access-nuevo');
    reintento.flush({ ok: true });

    expect(recibido).toEqual({ ok: true });
  });

  it('encola las peticiones concurrentes y refresca UNA sola vez', () => {
    auth['accessTokenSignal'].set('access-caducado');

    http.get('/api/v1/me').subscribe();
    http.get('/api/v1/pantry').subscribe();
    http.get('/api/v1/templates').subscribe();

    // Las tres fallan con 401 antes de que ninguna haya refrescado.
    mock.expectOne('/api/v1/me').flush(null, { status: 401, statusText: 'Unauthorized' });
    mock.expectOne('/api/v1/pantry').flush(null, { status: 401, statusText: 'Unauthorized' });
    mock.expectOne('/api/v1/templates').flush(null, { status: 401, statusText: 'Unauthorized' });

    // Un único refresh: el backend rota el token y revoca todo si detecta reúso,
    // así que dos refrescos en paralelo cerrarían la sesión del usuario.
    const refreshes = mock.match('/api/v1/auth/refresh');
    expect(refreshes.length).toBe(1);
    refreshes[0].flush(authResponse('nuevo'));

    for (const url of ['/api/v1/me', '/api/v1/pantry', '/api/v1/templates']) {
      const retry = mock.expectOne(url);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer access-nuevo');
      retry.flush({});
    }
  });

  it('si el refresh falla limpia la sesión y no reintenta', () => {
    auth['accessTokenSignal'].set('access-caducado');
    let fallo: unknown = null;

    http.get('/api/v1/me').subscribe({ error: (e) => (fallo = e) });

    mock.expectOne('/api/v1/me').flush(null, { status: 401, statusText: 'Unauthorized' });
    mock.expectOne('/api/v1/auth/refresh')
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(fallo).not.toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('un 401 sin sesión no dispara refresh', () => {
    auth.clearSession();

    http.get('/api/v1/me').subscribe({ error: () => {} });
    mock.expectOne('/api/v1/me').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(mock.match('/api/v1/auth/refresh').length).toBe(0);
  });
});
