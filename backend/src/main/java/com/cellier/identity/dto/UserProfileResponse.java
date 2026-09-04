package com.cellier.identity.dto;

import com.cellier.household.dto.HouseholdSummaryResponse;
import com.cellier.identity.domain.ThemePreference;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Schema(name = "UserProfile", description = """
        Perfil del usuario autenticado, con los hogares a los que pertenece.

        Es la misma forma en `/api/v1/me`, en el inicio de sesión y en la renovación de
        tokens: el cliente recibe los hogares junto con las credenciales y puede decidir a
        dónde llevar al usuario sin una segunda llamada.
        """)
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
        Instant createdAt,

        @Schema(description = """
                Hogares a los que pertenece, con su rol en cada uno. Lista vacía si aún no
                pertenece a ninguno, que es la señal de que toca la pantalla de bienvenida.

                Se relee de la base de datos en cada respuesta, también al renovar tokens: es
                así como el cliente se entera de que lo expulsaron de un hogar o de que lo
                ascendieron a administrador, sin que el rol tenga que viajar dentro del token.

                No incluye el código de ingreso: ese dato solo sale por
                `GET /api/v1/households/{householdId}`.""")
        List<HouseholdSummaryResponse> households
) {
}
