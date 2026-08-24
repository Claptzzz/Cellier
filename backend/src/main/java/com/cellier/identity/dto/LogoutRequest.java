package com.cellier.identity.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

@Schema(name = "LogoutRequest", description = "Refresh token de la sesión que se quiere cerrar.")
public record LogoutRequest(

        @Schema(
                description = "Refresh token a revocar.",
                example = "Yk9sM3RQb1JmVGpXd0hxTmJHc0ttWnhEdkFlUnVMY1E",
                requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank(message = "El refreshToken es obligatorio")
        String refreshToken
) {
}
