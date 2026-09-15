package com.cellier.template.dto;

import com.cellier.catalog.domain.ProductUnit;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.util.UUID;

/** Una línea de la plantilla, con el producto ya resuelto. */
@Schema(name = "TemplateItemResponse", description = "Producto y cantidad deseada.")
public record TemplateItemResponse(

        @Schema(description = "Identificador de la línea.",
                example = "9c2f5b41-7a03-4e18-bd66-1f8c0a3e5d27")
        UUID id,

        @Schema(description = "Producto del catálogo del hogar.",
                example = "7bfdf8ce-50e4-4144-9ec0-21320ce43d14")
        UUID productId,

        @Schema(description = "Nombre del producto.", example = "Huevos")
        String productName,

        @Schema(description = "Unidad canónica del producto. Toda cantidad va en ella.",
                example = "UNIT")
        ProductUnit unit,

        @Schema(description = "Categoría del producto, si la tiene.", example = "Frescos")
        String category,

        @Schema(description = "Cuánto quiere tener el hogar. Siempre mayor que cero.",
                example = "10")
        BigDecimal desiredQuantity
) {
}
