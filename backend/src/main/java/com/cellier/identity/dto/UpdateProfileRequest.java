package com.cellier.identity.dto;

import com.cellier.identity.domain.ThemePreference;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Actualización parcial del perfil. Los tres campos son opcionales: los que lleguen nulos
 * se dejan como están.
 */
@Schema(name = "UpdateProfileRequest", description = "Cambios a aplicar sobre el perfil. Todos los campos son opcionales.")
public record UpdateProfileRequest(

        @Schema(description = "Nuevo nombre para mostrar.", example = "Ana R.")
        @Size(min = 1, max = 100, message = "El nombre debe tener entre 1 y 100 caracteres")
        String displayName,

        @Schema(description = "Nueva preferencia de tema.", example = "DARK",
                allowableValues = {"SYSTEM", "LIGHT", "DARK"})
        ThemePreference themePreference,

        @Schema(description = "Nueva configuración regional, en formato BCP 47.", example = "es-CL")
        @Pattern(regexp = "^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$", message = "El locale debe tener el formato BCP 47, por ejemplo es-CL")
        String locale
) {
}
