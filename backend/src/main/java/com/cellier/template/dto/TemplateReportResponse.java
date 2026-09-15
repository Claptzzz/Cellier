package com.cellier.template.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Lo que hay que comprar para cumplir una plantilla.
 *
 * <p>Se calcula al vuelo y no se guarda. Una lista de la compra almacenada empieza a mentir
 * en cuanto alguien abre la nevera; ésta es cierta en el instante que dice {@code generatedAt}
 * y no pretende serlo después.
 */
@Schema(name = "TemplateReportResponse", description = "La plantilla comparada con la despensa.")
public record TemplateReportResponse(

        @Schema(description = "Plantilla comparada.", example = "3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13")
        UUID templateId,

        @Schema(description = "Nombre de la plantilla.", example = "Compra semanal")
        String templateName,

        @Schema(description = "Instante del cálculo. El reporte vale para ese momento.",
                example = "2026-08-24T15:00:00Z")
        Instant generatedAt,

        @Schema(description = "El reporte en tres cifras.")
        TemplateReportSummary summary,

        @Schema(description = """
                Las líneas, con los faltantes primero y agrupadas por categoría dentro de cada \
                grupo: es el orden en que se recorre un supermercado.""")
        List<TemplateReportItemResponse> items
) {
}
