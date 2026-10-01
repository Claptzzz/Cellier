package com.cellier.identity.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

@Schema(name = "TestLoginRequest", description = "Identidad del usuario semilla a autenticar, sin pasar por Google.")
public record TestLoginRequest(

        @Schema(description = "Correo del usuario semilla. Identifica la cuenta: se crea si no existe.",
                example = "ana@e2e.cellier.test")
        @NotBlank(message = "El correo es obligatorio")
        @Email(message = "El correo no tiene un formato válido")
        String email,

        @Schema(description = "Nombre para mostrar. Sólo se usa al crear la cuenta la primera vez.",
                example = "Ana Rivas")
        String displayName
) {
}
