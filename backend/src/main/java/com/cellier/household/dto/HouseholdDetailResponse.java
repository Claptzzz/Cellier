package com.cellier.household.dto;

import com.cellier.household.domain.HouseholdRole;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.UUID;

/**
 * Detalle de un hogar. Solo lo reciben sus miembros, así que es el único sitio de la API
 * donde viaja el código de ingreso.
 */
@Schema(name = "HouseholdDetail", description = "Detalle de un hogar, incluido su código de ingreso.")
public record HouseholdDetailResponse(

        @Schema(description = "Identificador del hogar.", example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
        UUID id,

        @Schema(description = "Nombre del hogar.", example = "Casa Rivas")
        String name,

        @Schema(description = """
                Código para solicitar el ingreso. Conocerlo no da acceso: abre una solicitud
                que un administrador debe aprobar.""",
                example = "K7M2QP9X")
        String joinCode,

        @Schema(description = "Rol del usuario autenticado en este hogar.", example = "ADMIN")
        HouseholdRole role,

        @Schema(description = "Número de personas que pertenecen al hogar.", example = "3")
        long memberCount,

        @Schema(description = "Fecha de creación del hogar.", example = "2026-09-03T18:42:11Z")
        Instant createdAt
) {
}
