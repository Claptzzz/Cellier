import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, tap, timeout } from 'rxjs';

import type { AuthResponse, UserProfile } from './auth.models';

/**
 * El refresh token es lo único que se persiste. El access token vive SÓLO en
 * memoria: dura 15 minutos y guardarlo en localStorage lo dejaría expuesto a
 * cualquier XSS sin ganar nada, porque se puede volver a pedir con el refresh.
 */
export const REFRESH_TOKEN_STORAGE_KEY = 'cellier.refreshToken';

/**
 * Cuánto se espera al perfil antes de dar el arranque por perdido.
 *
 * <p>Existe porque un servidor que **no responde** no produce ningún error: la petición
 * se queda colgada para siempre y con ella el app initializer, que bloquea el primer
 * pintado. Sin este límite, un backend congelado deja la pantalla en blanco de forma
 * indefinida, que es peor que un error.
 *
 * <p>Diez segundos: por encima de lo que tarda una red móvil mala, y por debajo de lo que
 * cualquiera aguanta mirando un indicador de carga sin conclusión.
 */
export const PROFILE_LOAD_TIMEOUT_MS = 10_000;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly accessTokenSignal = signal<string | null>(null);
  private readonly refreshTokenSignal = signal<string | null>(this.readStoredRefreshToken());
  private readonly userSignal = signal<UserProfile | null>(null);

  /**
   * Un intento de cargar el perfil que falló por no poder hablar con el servidor.
   *
   * <p>Se recuerda para no repetir la espera: el arranque ya aguardó su turno, y si el
   * guard volviera a intentarlo el usuario esperaría el timeout dos veces seguidas antes
   * de ver nada. Lo limpia {@link retryProfileLoad}, que es lo que hace el botón de
   * reintentar.
   */
  private readonly profileUnreachable = signal(false);

  readonly user = this.userSignal.asReadonly();

  /** Hay sesión, pero no se pudo traer el perfil: el servidor no contesta. */
  readonly isProfileUnreachable = this.profileUnreachable.asReadonly();
  readonly accessToken = this.accessTokenSignal.asReadonly();

  /**
   * Hay sesión si queda un refresh token, aunque todavía no haya access token:
   * al recargar la página el access se ha perdido y se recupera en el arranque.
   */
  readonly isAuthenticated = computed(() => this.refreshTokenSignal() !== null);

  readonly displayName = computed(() => this.userSignal()?.displayName ?? '');

  /** Iniciales para el avatar cuando no hay foto. */
  readonly initials = computed(() => {
    const name = this.userSignal()?.displayName?.trim();
    if (!name) {
      return '';
    }
    const parts = name.split(/\s+/).slice(0, 2);
    return parts.map((part) => part.charAt(0).toUpperCase()).join('');
  });

  loginWithGoogle(idToken: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>('/api/v1/auth/google', { idToken })
      .pipe(tap((response) => this.applySession(response)));
  }

  /**
   * Canjea el refresh token. Lo consume el interceptor ante un 401 y también el
   * arranque de la app. No agrega la cabecera Authorization: se autentica con el
   * propio refresh token.
   */
  refresh(): Observable<AuthResponse> {
    const refreshToken = this.refreshTokenSignal();
    if (!refreshToken) {
      throw new Error('No hay refresh token que canjear');
    }
    return this.http
      .post<AuthResponse>('/api/v1/auth/refresh', { refreshToken })
      .pipe(tap((response) => this.applySession(response)));
  }

  /**
   * Garantiza que hay perfil antes de seguir. Lo usa el guard: las decisiones sobre
   * hogares dependen de `user().households`, y al recargar la página el perfil todavía
   * no está —el access token vive sólo en memoria—, así que sin esto el guard decidiría
   * con una lista vacía y mandaría a la bienvenida a alguien que sí tiene hogares.
   *
   * <p>Un fallo de red devuelve `null` en vez de romper la navegación; de la sesión
   * inválida ya se encarga el interceptor.
   */
  ensureProfileLoaded(): Observable<UserProfile | null> {
    const current = this.userSignal();
    if (current) {
      return of(current);
    }
    if (this.profileUnreachable()) {
      // Ya se intentó y el servidor no estaba. Responder de inmediato deja que quien
      // pregunte enseñe la pantalla de reconexión en vez de encadenar otra espera.
      return of(null);
    }
    return this.loadProfile().pipe(
      timeout({ each: PROFILE_LOAD_TIMEOUT_MS }),
      catchError(() => {
        // Un 401 no llega hasta aquí como fallo de red: el interceptor lo intenta
        // resolver refrescando y, si no puede, limpia la sesión. En ese caso
        // `isAuthenticated()` ya es falso y quien pregunte mandará a /login.
        this.profileUnreachable.set(true);
        return of(null);
      }),
    );
  }

  /** Vuelve a intentar traer el perfil. Es lo que dispara el botón de reintentar. */
  retryProfileLoad(): Observable<UserProfile | null> {
    this.profileUnreachable.set(false);
    return this.ensureProfileLoaded();
  }

  loadProfile(): Observable<UserProfile> {
    return this.http
      .get<UserProfile>('/api/v1/me')
      .pipe(tap((user) => this.userSignal.set(user)));
  }

  /** Revoca en el servidor y limpia el cliente pase lo que pase. */
  logout(): void {
    const refreshToken = this.refreshTokenSignal();
    if (refreshToken) {
      this.http.post<void>('/api/v1/auth/logout', { refreshToken }).subscribe({
        next: () => {},
        error: () => {},
      });
    }
    this.clearSession();
  }

  /**
   * El backend rota el refresh token en cada canje, así que siempre hay que
   * guardar el nuevo: conservar el anterior deja la sesión muerta.
   */
  private applySession(response: AuthResponse): void {
    this.accessTokenSignal.set(response.accessToken);
    this.userSignal.set(response.user);
    this.setRefreshToken(response.refreshToken);
  }

  clearSession(): void {
    this.accessTokenSignal.set(null);
    this.userSignal.set(null);
    this.profileUnreachable.set(false);
    this.setRefreshToken(null);
  }

  private setRefreshToken(token: string | null): void {
    this.refreshTokenSignal.set(token);
    try {
      if (token) {
        localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
      } else {
        localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
      }
    } catch {
      // Almacenamiento bloqueado: la sesión dura lo que la pestaña.
    }
  }

  private readStoredRefreshToken(): string | null {
    try {
      return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }
}
