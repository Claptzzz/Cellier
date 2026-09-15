package com.cellier.template.dto;

import com.cellier.catalog.domain.ProductUnit;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.util.UUID;

/** Una línea del reporte: qué se quiere, qué hay, y qué falta. */
@Schema(name = "TemplateReportItemResponse", description = "Un producto de la plantilla frente a la despensa.")
public record TemplateReportItemResponse(

        @Schema(description = "Producto del catálogo del hogar.",
                example = "7bfdf8ce-50e4-4144-9ec0-21320ce43d14")
        UUID productId,

        @Schema(description = "Nombre del producto.", example = "Huevos")
        String productName,

        @Schema(description = "Unidad canónica. Las tres cantidades van en ella.", example = "UNIT")
        ProductUnit unit,

        @Schema(description = "Categoría, si la tiene. Es lo que agrupa el recorrido del súper.",
                example = "Frescos")
        String category,

        @Schema(description = "Cuánto quiere ESTA plantilla.", example = "10")
        BigDecimal desiredQuantity,

        @Schema(description = """
                Cuánto hay en la despensa ahora. Cero si el producto no está en ella: no \
                tenerlo registrado y tenerlo a cero llevan a la misma compra.""",
                example = "4")
        BigDecimal availableQuantity,

        @Schema(description = "Lo que falta. Nunca negativo: tener de más no es tener que devolver.",
                example = "6")
        BigDecimal missingQuantity,

        @Schema(description = "COMPLETE cuando no falta nada; MISSING cuando falta.",
                example = "MISSING", allowableValues = {"COMPLETE", "MISSING"})
        ReportItemStatus status
) {
}
