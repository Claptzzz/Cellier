package com.cellier.template.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.UUID;

/** Una línea que se quiere en la plantilla. */
@Schema(name = "TemplateItemRequest", description = "Producto del hogar y cuánto se quiere tener.")
public record TemplateItemRequest(

        @Schema(description = "Producto del catálogo de ESTE hogar.",
                example = "7bfdf8ce-50e4-4144-9ec0-21320ce43d14")
        @NotNull(message = "Falta el producto")
        UUID productId,

        @Schema(description = """
                Cuánto se quiere tener, en la unidad del producto. Mayor que cero: querer \
                «cero» de algo no es quererlo, es no tener la línea.""",
                example = "10")
        @NotNull(message = "Falta la cantidad deseada")
        @DecimalMin(value = "0", inclusive = false, message = "La cantidad deseada tiene que ser mayor que cero")
        BigDecimal desiredQuantity
) {
}
