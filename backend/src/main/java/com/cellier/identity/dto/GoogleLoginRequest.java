package com.cellier.identity.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

@Schema(name = "GoogleLoginRequest", description = "ID token obtenido de Google Identity Services en el cliente.")
public record GoogleLoginRequest(

        @Schema(
                description = "ID token (JWT) que devuelve Google Identity Services tras el inicio de sesión.",
                example = "eyJhbGciOiJSUzI1NiIsImtpZCI6IjFhIn0.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20ifQ.firma",
                requiredMode = Schema.RequiredMode.REQUIRED)
        @NotBlank(message = "El idToken es obligatorio")
        String idToken
) {
}
