package com.cellier.identity.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(name = "AuthResponse", description = "Credenciales emitidas por Cellier tras autenticar al usuario.")
public record AuthResponse(

        @Schema(description = "Access token JWT. Se envía como `Authorization: Bearer <token>`.",
                example = "eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJjZWxsaWVyIn0.firma")
        String accessToken,

        @Schema(description = """
                Refresh token opaco. Es el único momento en que se entrega en claro: el servidor
                solo guarda su hash. Consérvalo para llamar a `/api/v1/auth/refresh`.""",
                example = "Yk9sM3RQb1JmVGpXd0hxTmJHc0ttWnhEdkFlUnVMY1E")
        String refreshToken,

        @Schema(description = "Segundos de vigencia del access token.", example = "900")
        long expiresIn,

        @Schema(description = "Perfil del usuario autenticado.")
        UserProfileResponse user
) {
}
