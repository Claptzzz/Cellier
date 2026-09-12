package com.cellier.catalog.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;

/**
 * Cambios sobre un producto. Ambos campos son opcionales: los que lleguen nulos se dejan
 * como están.
 *
 * <p><strong>La unidad no está aquí y no es un olvido.</strong> Cambiarla reinterpretaría
 * todas las cantidades ya registradas de ese producto: un 2 pasaría de dos litros a dos
 * gramos sin que nada en la despensa se viera distinto. Quien se equivocó de unidad crea
 * otro producto.
 */
@Schema(name = "UpdateProductRequest",
        description = "Cambios sobre un producto. La unidad no se puede cambiar.")
public record UpdateProductRequest(

        @Schema(description = "Nuevo nombre.", example = "Huevos de campo")
        @Size(min = 1, max = 120, message = "El nombre debe tener entre 1 y 120 caracteres")
        String name,

        @Schema(description = "Nueva categoría. Enviar una cadena vacía la quita.", example = "Nevera")
        @Size(max = 60, message = "La categoría no puede pasar de 60 caracteres")
        String category
) {
}
