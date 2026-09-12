package com.cellier.pantry.dto;

import com.cellier.pantry.domain.StorageLocation;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Cambios sobre un artículo. Todos los campos son opcionales: los que lleguen nulos se dejan
 * como están.
 *
 * <p>Fijar {@code quantity} registra un movimiento de tipo {@code ADJUSTMENT}, porque es
 * alguien corrigiendo a mano lo que el sistema creía tener. Para gastar o reponer están
 * {@code :consume} y {@code :restock}, que dicen <em>qué</em> pasó además de cuánto.
 *
 * <p>Todo lo que se puede cambiar aquí es un valor <em>absoluto</em>: depende de lo que quien
 * edita tenía delante cuando decidió. Por eso este es el único sitio de la despensa donde el
 * cliente puede mandar la {@code version} que leyó. {@code :consume} y {@code :restock} no la
 * llevan ni la necesitan: son deltas relativos y componen bien en cualquier orden.
 */
@Schema(name = "UpdatePantryItemRequest", description = "Cambios sobre un artículo de la despensa.")
public record UpdatePantryItemRequest(

        @Schema(description = """
                Versión del artículo que tenías a la vista. Si llega y ya no es la actual, la \
                petición se rechaza con 409 y la respuesta dice en qué quedó, para que puedas \
                mostrarlo sin pedirlo otra vez. Si se omite, el cambio se aplica sobre lo que \
                haya: úsala siempre que edites a partir de algo que el usuario leyó en pantalla.""",
                example = "3")
        @PositiveOrZero(message = "La versión no puede ser negativa")
        Long version,

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
