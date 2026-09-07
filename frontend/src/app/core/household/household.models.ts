/**
 * Espejo de los DTOs del módulo `household` del backend. Los nombres y las formas
 * son literalmente los de la API: si algo no cuadra, el que manda es el backend.
 */

export type HouseholdRole = 'ADMIN' | 'MEMBER';

export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/** `HouseholdSummary`: lo que devuelve `GET /households` y lo que viaja en el perfil. */
export interface HouseholdSummary {
  readonly id: string;
  readonly name: string;
  readonly role: HouseholdRole;
  readonly memberCount: number;
}

/**
 * `HouseholdDetail`: el único sitio de la API por el que sale el `joinCode`, y sólo
 * después de comprobar la membresía. No lo copies a ningún otro modelo.
 */
export interface HouseholdDetail extends HouseholdSummary {
  readonly joinCode: string;
  readonly createdAt: string;
}

/** `HouseholdMember`. Se identifica por el id del usuario, no por el de la membresía. */
export interface HouseholdMember {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly avatarUrl: string | null;
  readonly role: HouseholdRole;
  readonly joinedAt: string;
}

/** `JoinRequest`: una solicitud vista por el administrador que debe resolverla. */
export interface JoinRequest {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly avatarUrl: string | null;
  readonly status: JoinRequestStatus;
  readonly requestedAt: string;
  readonly resolvedAt: string | null;
  readonly resolvedByUserId: string | null;
}

/** `MyJoinRequest`: la misma solicitud vista por quien la envió. Sin datos del hogar más allá del nombre. */
export interface MyJoinRequest {
  readonly id: string;
  readonly householdId: string;
  readonly householdName: string;
  readonly status: JoinRequestStatus;
  readonly requestedAt: string;
  readonly resolvedAt: string | null;
}

/** `JoinCode`: la respuesta de regenerar el código. */
export interface JoinCode {
  readonly joinCode: string;
}

/**
 * El alfabeto del código de ingreso, replicado del backend: mayúsculas y dígitos sin
 * los caracteres que se confunden al dictar o teclear (0, O, 1, I, L).
 *
 * Se duplica a propósito para poder dar feedback de formato **antes** de gastar una
 * petición. La fuente de verdad sigue siendo el servidor: si algún día cambia el
 * alfabeto, aquí sólo se pierde el aviso temprano, nunca la corrección.
 */
export const JOIN_CODE_PATTERN = /^[A-HJKMNP-Z2-9]{8}$/;

export const JOIN_CODE_LENGTH = 8;

/** Normaliza como lo hace el backend: sin espacios y en mayúsculas. */
export function normalizeJoinCode(raw: string): string {
  // Locale.ROOT en el servidor, 'en-US' aquí: en turco "i".toUpperCase() no da "I".
  return raw.trim().toLocaleUpperCase('en-US');
}
