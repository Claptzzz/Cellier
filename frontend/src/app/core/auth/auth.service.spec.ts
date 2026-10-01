import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { installLocalStorage } from '../../../testing/local-storage';
import { ThemeService } from '../theme/theme.service';
import { AuthService, REFRESH_TOKEN_STORAGE_KEY } from './auth.service';
import type { UserProfile } from './auth.models';

const PERFIL: UserProfile = {
  id: 'u1',
  email: 'ana.rivas@gmail.com',
  displayName: 'Ana Rivas',
  avatarUrl: null,
  locale: 'es-CL',
  themePreference: 'DARK',
  createdAt: '2026-08-24T20:15:30Z',
  households: [{ id: 'casa', name: 'Casa Rivas', role: 'ADMIN', memberCount: 3 }],
};

function setUp() {
  installLocalStorage();
  localStorage.clear();
  localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, 'refresh-de-prueba');

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });

  return {
    auth: TestBed.inject(AuthService),
    theme: TestBed.inject(ThemeService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('AuthService', () => {
  describe('updateProfile', () => {
    it('envía sólo los campos indicados y actualiza el perfil en memoria', () => {
      const { auth, http } = setUp();

      let recibido: UserProfile | undefined;
      auth.updateProfile({ displayName: 'Ana R.' }).subscribe((p) => (recibido = p));

      const peticion = http.expectOne('/api/v1/me');
      expect(peticion.request.method).toBe('PATCH');
      expect(peticion.request.body).toEqual({ displayName: 'Ana R.' });

      peticion.flush({ ...PERFIL, displayName: 'Ana R.' });

      expect(recibido?.displayName).toBe('Ana R.');
      expect(auth.user()?.displayName).toBe('Ana R.');
    });

    it('siembra el tema de este dispositivo si el perfil actualizado trae otro y no había ninguno propio', () => {
      const { auth, theme, http } = setUp();

      auth.updateProfile({ themePreference: 'DARK' }).subscribe();
      http.expectOne('/api/v1/me').flush({ ...PERFIL, themePreference: 'DARK' });

      expect(theme.mode()).toBe('dark');
    });
  });

  describe('exportData', () => {
    it('pide GET /api/v1/me/export y no toca el perfil en memoria', () => {
      const { auth, http } = setUp();

      let recibido: UserProfile | undefined;
      auth.exportData().subscribe((p) => (recibido = p));

      const peticion = http.expectOne('/api/v1/me/export');
      expect(peticion.request.method).toBe('GET');
      peticion.flush(PERFIL);

      expect(recibido?.email).toBe('ana.rivas@gmail.com');
      // La exportación no es el perfil de la sesión: no lo pisa.
      expect(auth.user()).toBeNull();
    });
  });

  describe('deleteAccount', () => {
    it('pide DELETE /api/v1/me y limpia la sesión al terminar', () => {
      const { auth, http } = setUp();

      let completado = false;
      auth.deleteAccount().subscribe(() => (completado = true));

      const peticion = http.expectOne('/api/v1/me');
      expect(peticion.request.method).toBe('DELETE');
      peticion.flush(null, { status: 204, statusText: 'No Content' });

      expect(completado).toBe(true);
      expect(auth.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('un 409 por último administrador no limpia la sesión: la baja no ocurrió', () => {
      const { auth, http } = setUp();

      let fallo: unknown;
      auth.deleteAccount().subscribe({ error: (e) => (fallo = e) });

      http.expectOne('/api/v1/me').flush(
        { blockingHouseholds: [{ id: 'casa', name: 'Casa Rivas' }] },
        { status: 409, statusText: 'Conflict' },
      );

      expect(fallo).toBeTruthy();
      expect(auth.isAuthenticated()).toBe(true);
    });
  });

  describe('siembra del tema al cargar el perfil', () => {
    it('loadProfile siembra el tema del dispositivo si no tenía ninguno', () => {
      const { auth, theme, http } = setUp();

      auth.loadProfile().subscribe();
      http.expectOne('/api/v1/me').flush(PERFIL);

      expect(theme.mode()).toBe('dark');
    });

    it('no pisa un tema que el dispositivo ya tenía elegido', () => {
      const { auth, theme, http } = setUp();
      theme.set('light');

      auth.loadProfile().subscribe();
      http.expectOne('/api/v1/me').flush(PERFIL);

      expect(theme.mode()).toBe('light');
    });
  });
});
