import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type {
  HouseholdDetail,
  HouseholdMember,
  HouseholdRole,
  HouseholdSummary,
  JoinCode,
  JoinRequest,
  JoinRequestStatus,
  MyJoinRequest,
} from './household.models';

/**
 * Acceso HTTP al módulo de hogares. Sólo transporta: no cachea, no decide y no
 * mantiene estado. Quien necesite estado lo construye encima (ver
 * `HouseholdContextService` y `MyJoinRequestsService`).
 */
@Injectable({ providedIn: 'root' })
export class HouseholdApi {
  private readonly http = inject(HttpClient);

  private readonly base = '/api/v1/households';

  // -- Hogares -------------------------------------------------------------

  list(): Observable<readonly HouseholdSummary[]> {
    return this.http.get<readonly HouseholdSummary[]>(this.base);
  }

  create(name: string): Observable<HouseholdDetail> {
    return this.http.post<HouseholdDetail>(this.base, { name });
  }

  get(householdId: string): Observable<HouseholdDetail> {
    return this.http.get<HouseholdDetail>(`${this.base}/${householdId}`);
  }

  rename(householdId: string, name: string): Observable<HouseholdDetail> {
    return this.http.patch<HouseholdDetail>(`${this.base}/${householdId}`, { name });
  }

  remove(householdId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${householdId}`);
  }

  /** Emite un código nuevo y anula el anterior en el acto. */
  regenerateJoinCode(householdId: string): Observable<JoinCode> {
    return this.http.post<JoinCode>(`${this.base}/${householdId}/join-code:regenerate`, {});
  }

  // -- Miembros ------------------------------------------------------------

  members(householdId: string): Observable<readonly HouseholdMember[]> {
    return this.http.get<readonly HouseholdMember[]>(`${this.base}/${householdId}/members`);
  }

  changeRole(householdId: string, userId: string, role: HouseholdRole): Observable<HouseholdMember> {
    return this.http.patch<HouseholdMember>(`${this.base}/${householdId}/members/${userId}`, { role });
  }

  /** Expulsa a alguien, o sale uno mismo si `userId` es el propio. */
  removeMember(householdId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${householdId}/members/${userId}`);
  }

  // -- Solicitudes, lado del administrador ---------------------------------

  joinRequests(householdId: string, status?: JoinRequestStatus): Observable<readonly JoinRequest[]> {
    // Sin `status` el backend devuelve todas, con las pendientes primero.
    const params = status ? new HttpParams().set('status', status) : undefined;
    return this.http.get<readonly JoinRequest[]>(`${this.base}/${householdId}/join-requests`, { params });
  }

  approve(householdId: string, joinRequestId: string): Observable<JoinRequest> {
    return this.http.post<JoinRequest>(
      `${this.base}/${householdId}/join-requests/${joinRequestId}:approve`, {});
  }

  reject(householdId: string, joinRequestId: string): Observable<JoinRequest> {
    return this.http.post<JoinRequest>(
      `${this.base}/${householdId}/join-requests/${joinRequestId}:reject`, {});
  }

  // -- Solicitudes, lado del solicitante -----------------------------------

  /** Enviar el código no da acceso: abre una solicitud que un administrador debe aprobar. */
  requestToJoin(joinCode: string): Observable<MyJoinRequest> {
    return this.http.post<MyJoinRequest>('/api/v1/join-requests', { joinCode });
  }

  myJoinRequests(): Observable<readonly MyJoinRequest[]> {
    return this.http.get<readonly MyJoinRequest[]>('/api/v1/join-requests/mine');
  }

  /** Sólo la cancela quien la envió, y sólo si sigue pendiente. */
  cancelJoinRequest(joinRequestId: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/join-requests/${joinRequestId}`);
  }
}
