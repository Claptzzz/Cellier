package com.cellier.household.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(name = "JoinCode", description = "Código de ingreso vigente de un hogar.")
public record JoinCodeResponse(

        @Schema(description = "Código de 8 caracteres. Sustituye al anterior, que deja de servir.",
                example = "K7M2QP9X")
        String joinCode
) {
}
