package com.cellier.pantry.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

/** Cuánto se gasta o se repone. Siempre en positivo: la dirección la da el endpoint. */
@Schema(name = "QuantityRequest", description = "Cantidad a gastar o reponer, en la unidad del producto.")
public record QuantityRequest(

        @Schema(description = "Cantidad, mayor que cero.", example = "2")
        @NotNull(message = "La cantidad es obligatoria")
        @DecimalMin(value = "0", inclusive = false, message = "La cantidad tiene que ser mayor que cero")
        BigDecimal quantity
) {
}
