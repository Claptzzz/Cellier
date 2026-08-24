/** Respuesta de `GET /api/v1/health`. Refleja `HealthResponse` del backend. */
export interface HealthResponse {
  readonly status: string;
  readonly service: string;
}

/** Estado del sondeo tal y como lo consume la vista. */
export type HealthState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ok'; readonly payload: HealthResponse }
  | { readonly kind: 'error'; readonly message: string };
