package com.cellier.household.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Schema(name = "CreateHouseholdRequest", description = "Datos para crear un hogar.")
public record CreateHouseholdRequest(

        @Schema(description = "Nombre del hogar.", example = "Casa Rivas")
        @NotBlank(message = "El nombre del hogar es obligatorio")
        @Size(max = 80, message = "El nombre del hogar no puede pasar de 80 caracteres")
        String name
) {
}
