package com.cellier.identity.dto;

import com.cellier.identity.domain.ThemePreference;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.UUID;

@Schema(name = "UserProfile", description = "Perfil del usuario autenticado.")
public record UserProfileResponse(

        @Schema(description = "Identificador del usuario en Cellier.",
                example = "3f1c9a2e-5b7d-4a10-9c88-2f0e6b4d1a73")
        UUID id,

        @Schema(description = "Correo de la cuenta de Google asociada.", example = "ana.rivas@gmail.com")
        String email,

        @Schema(description = "Nombre para mostrar.", example = "Ana Rivas")
        String displayName,

        @Schema(description = "URL del avatar, o null si la cuenta no tiene foto.",
                example = "https://lh3.googleusercontent.com/a/ACg8ocK")
        String avatarUrl,

        @Schema(description = "Configuración regional preferida.", example = "es-CL")
        String locale,

        @Schema(description = "Preferencia de tema de la interfaz.", example = "SYSTEM")
        ThemePreference themePreference,

        @Schema(description = "Fecha de alta en Cellier.", example = "2026-08-24T20:15:30Z")
        Instant createdAt
) {
}
