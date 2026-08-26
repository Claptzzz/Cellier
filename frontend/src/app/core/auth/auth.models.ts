/** Espeja UserProfile del backend (`GET /api/v1/me`). */
export interface UserProfile {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly locale: string;
  readonly themePreference: 'SYSTEM' | 'LIGHT' | 'DARK';
  readonly createdAt: string;
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
