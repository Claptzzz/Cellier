package com.cellier.household.dto;

import com.cellier.household.domain.JoinRequestStatus;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.UUID;

/**
 * Una solicitud propia, tal como la ve quien la envió.
 *
 * <p>Lleva el nombre del hogar para que el solicitante sepa a qué casa pidió entrar —tecleó un
 * código, no un nombre—, pero nada más de él: ni el código de ingreso, ni cuánta gente hay
 * dentro, ni quiénes son. Todo eso llega al ser admitido.
 */
@Schema(name = "MyJoinRequest", description = "Solicitud de ingreso enviada por el usuario autenticado.")
public record MyJoinRequestResponse(

        @Schema(description = "Identificador de la solicitud.", example = "5a1e93b7-2c04-4d88-91fe-77b6c0a2d431")
        UUID id,

        @Schema(description = "Hogar al que se pidió entrar.", example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
        UUID householdId,

        @Schema(description = "Nombre de ese hogar.", example = "Casa Rivas")
        String householdName,

        @Schema(description = "Estado de la solicitud.", example = "PENDING",
                allowableValues = {"PENDING", "APPROVED", "REJECTED", "CANCELLED"})
        JoinRequestStatus status,

        @Schema(description = "Cuándo se envió.", example = "2026-09-04T09:15:02Z")
        Instant requestedAt,

        @Schema(description = "Cuándo se resolvió, o null si sigue pendiente.",
                example = "2026-09-04T10:02:44Z")
        Instant resolvedAt
) {
}
