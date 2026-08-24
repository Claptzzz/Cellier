package com.cellier.identity.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

@Schema(name = "RefreshRequest", description = "Refresh token vigente que se desea canjear.")
public record RefreshRequest(

        @Schema(
                description = "Refresh token opaco entregado en el último inicio de sesión o refresco.",
                example = "Yk9sM3RQb1JmVGpXd0hxTmJHc0ttWnhEdkFlUnVMY1E",
                requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank(message = "El refreshToken es obligatorio")
        String refreshToken
) {
}
