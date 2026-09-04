package com.cellier.household.dto;

import com.cellier.household.domain.JoinRequestStatus;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.UUID;

/**
 * Una solicitud tal como la ve el administrador que debe resolverla.
 *
 * <p>Incluye el correo del solicitante, y es uno de los dos únicos sitios de la API donde ese
 * dato viaja. Aprobar da acceso a la despensa de una casa, así que quien decide necesita poder
 * distinguir a dos personas con el mismo nombre.
 */
@Schema(name = "JoinRequest", description = "Solicitud de ingreso a un hogar, con los datos de quien la envía.")
public record JoinRequestResponse(

        @Schema(description = "Identificador de la solicitud.", example = "5a1e93b7-2c04-4d88-91fe-77b6c0a2d431")
        UUID id,

        @Schema(description = "Identificador de quien solicita entrar.",
                example = "d90f4c21-77ab-4e35-9f62-1c8b03ad5e47")
        UUID userId,

        @Schema(description = "Nombre para mostrar del solicitante.", example = "Bruno Soto")
        String displayName,

        @Schema(description = "Correo del solicitante, para distinguir homónimos antes de aprobar.",
                example = "bruno.soto@gmail.com")
        String email,

        @Schema(description = "Avatar del solicitante, o null.",
                example = "https://lh3.googleusercontent.com/a/ACg8ocK")
        String avatarUrl,

        @Schema(description = "Estado de la solicitud.", example = "PENDING",
                allowableValues = {"PENDING", "APPROVED", "REJECTED", "CANCELLED"})
        JoinRequestStatus status,

        @Schema(description = "Cuándo se envió.", example = "2026-09-04T09:15:02Z")
        Instant requestedAt,

        @Schema(description = "Cuándo se resolvió, o null si sigue pendiente.",
                example = "2026-09-04T10:02:44Z")
        Instant resolvedAt,

        @Schema(description = """
                Quién la resolvió: el administrador que la aprobó o rechazó, o el propio
                solicitante si la canceló. Null mientras siga pendiente.""",
                example = "3f1c9a2e-5b7d-4a10-9c88-2f0e6b4d1a73")
        UUID resolvedByUserId
) {
}
