import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import type { AuthResponse, UserProfile } from './auth.models';

/**
 * El refresh token es lo único que se persiste. El access token vive SÓLO en
 * memoria: dura 15 minutos y guardarlo en localStorage lo dejaría expuesto a
 * cualquier XSS sin ganar nada, porque se puede volver a pedir con el refresh.
 */
export const REFRESH_TOKEN_STORAGE_KEY = 'cellier.refreshToken';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly accessTokenSignal = signal<string | null>(null);
  private readonly refreshTokenSignal = signal<string | null>(this.readStoredRefreshToken());
  private readonly userSignal = signal<UserProfile | null>(null);

  readonly user = this.userSignal.asReadonly();
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
