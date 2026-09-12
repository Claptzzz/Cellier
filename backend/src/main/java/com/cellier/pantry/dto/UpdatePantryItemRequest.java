package com.cellier.pantry.dto;

import com.cellier.pantry.domain.StorageLocation;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Cambios sobre un artículo. Todos los campos son opcionales: los que lleguen nulos se dejan
 * como están.
 *
 * <p>Fijar {@code quantity} registra un movimiento de tipo {@code ADJUSTMENT}, porque es
 * alguien corrigiendo a mano lo que el sistema creía tener. Para gastar o reponer están
 * {@code :consume} y {@code :restock}, que dicen <em>qué</em> pasó además de cuánto.
 */
@Schema(name = "UpdatePantryItemRequest", description = "Cambios sobre un artículo de la despensa.")
public record UpdatePantryItemRequest(

        @Schema(description = "Cantidad contada a mano. Registra un ajuste.", example = "450")
        @DecimalMin(value = "0", message = "La cantidad no puede ser negativa")
        BigDecimal quantity,

        @Schema(description = "Nuevo vencimiento.", example = "2026-11-02")
        LocalDate expiresAt,

        @Schema(description = "Nuevo nivel objetivo.", example = "1000")
        @DecimalMin(value = "0", inclusive = false, message = "El nivel objetivo tiene que ser mayor que cero")
        BigDecimal parLevel,

        @Schema(description = "Dónde se guarda.", example = "FRIDGE",
                allowableValues = {"PANTRY", "FRIDGE", "FREEZER", "OTHER"})
        StorageLocation storageLocation
) {
}
