import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { SKIP_ERROR_TOAST } from '../auth/error.interceptor';
import type { TemplateReport } from './report.models';
import type { TemplateDetail, TemplateItemInput, TemplateSummary } from './template.models';

/**
 * Acceso HTTP a las plantillas. Sólo transporta: no cachea, no decide y no mantiene estado.
 */
@Injectable({ providedIn: 'root' })
export class TemplateApi {
  private readonly http = inject(HttpClient);

  /** Los errores los pinta la pantalla, con su estado y su reintento. */
  private readonly handledByCaller = new HttpContext().set(SKIP_ERROR_TOAST, true);

  list(householdId: string): Observable<readonly TemplateSummary[]> {
    return this.http.get<readonly TemplateSummary[]>(
      this.base(householdId),
      { context: this.handledByCaller },
    );
  }

  get(householdId: string, templateId: string): Observable<TemplateDetail> {
    return this.http.get<TemplateDetail>(
      `${this.base(householdId)}/${templateId}`,
      { context: this.handledByCaller },
    );
  }

  /**
   * Crea una plantilla, con líneas o sin ellas.
   *
   * <p>Las líneas iniciales son lo que hace que duplicar no necesite un endpoint propio:
   * se lee el detalle de la original y se crea otra con las mismas.
   */
  create(
    householdId: string,
    name: string,
    items: readonly TemplateItemInput[] = [],
  ): Observable<TemplateDetail> {
    return this.http.post<TemplateDetail>(
      this.base(householdId),
      { name, items },
      { context: this.handledByCaller },
    );
  }

  rename(householdId: string, templateId: string, name: string): Observable<TemplateDetail> {
    return this.http.patch<TemplateDetail>(
      `${this.base(householdId)}/${templateId}`,
      { name },
      { context: this.handledByCaller },
    );
  }

  remove(householdId: string, templateId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.base(householdId)}/${templateId}`,
      { context: this.handledByCaller },
    );
  }

  /** Reemplazo completo: lo que no venga deja de estar. */
  replaceItems(
    householdId: string,
    templateId: string,
    items: readonly TemplateItemInput[],
  ): Observable<TemplateDetail> {
    return this.http.put<TemplateDetail>(
      `${this.base(householdId)}/${templateId}/items`,
      { items },
      { context: this.handledByCaller },
    );
  }

  /**
   * El reporte de compras, calculado ahora.
   *
   * <p>No se cachea en ningún sitio, ni entre sesiones ni dentro de una: el sentido de la
   * pantalla es reflejar el stock de este momento, y un reporte guardado empieza a mentir en
   * cuanto alguien abre la nevera.
   */
  report(householdId: string, templateId: string): Observable<TemplateReport> {
    return this.http.get<TemplateReport>(
      `${this.base(householdId)}/${templateId}/report`,
      { context: this.handledByCaller },
    );
  }

  private base(householdId: string): string {
    return `/api/v1/households/${householdId}/templates`;
  }
}
