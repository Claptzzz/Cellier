package com.cellier.template.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;

/** El reporte en tres cifras. */
@Schema(name = "TemplateReportSummary", description = "Resumen del reporte.")
public record TemplateReportSummary(

        @Schema(description = "Cuántas líneas tiene la plantilla.", example = "12")
        int totalItems,

        @Schema(description = "De cuántas falta algo.", example = "4")
        int missingItems,

        @Schema(description = """
                Proporción de líneas cubiertas, con dos decimales. Una plantilla vacía vale \
                cero: sin líneas no hay nada cubierto que proclamar.""",
                example = "0.67")
        BigDecimal completionRate
) {
}
