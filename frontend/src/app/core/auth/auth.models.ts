import type { HouseholdSummary } from '../household/household.models';

/** Espeja UserProfile del backend (`GET /api/v1/me`). */
export interface UserProfile {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly locale: string;
  readonly themePreference: 'SYSTEM' | 'LIGHT' | 'DARK';
  readonly createdAt: string;

  /**
   * Los hogares del usuario con su rol en cada uno. Llega en las tres respuestas que
   * transportan el perfil —`/me`, el login y el refresh— y el backend la relee de la
   * base en cada una: es así como una sesión abierta se entera de que la expulsaron de
   * un hogar o de que la ascendieron. No la caches por tu cuenta.
   */
  readonly households: readonly HouseholdSummary[];
}

/** Espeja AuthResponse del backend. */
export interface AuthResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly user: UserProfile;
}

/** RFC 9457. Es lo que devuelve el backend en cualquier error. */
export interface ProblemDetail {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly errors?: Readonly<Record<string, string>>;
  readonly globalErrors?: readonly string[];
}
