package com.cellier.household.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Cambio de nombre de un hogar. El nombre es hoy el único campo editable, así que es
 * obligatorio: una petición sin él no expresaría ningún cambio.
 */
@Schema(name = "UpdateHouseholdRequest", description = "Cambios a aplicar sobre un hogar.")
public record UpdateHouseholdRequest(

        @Schema(description = "Nuevo nombre del hogar.", example = "Casa Rivas Soto")
        @NotBlank(message = "El nombre del hogar es obligatorio")
        @Size(max = 80, message = "El nombre del hogar no puede pasar de 80 caracteres")
        String name
) {
}
