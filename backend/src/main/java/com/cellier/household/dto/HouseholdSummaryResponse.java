package com.cellier.household.dto;

import com.cellier.household.domain.HouseholdRole;
import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

/**
 * Un hogar tal y como lo ve uno de sus miembros en un listado.
 *
 * <p>No lleva el código de ingreso a propósito: es un dato sensible que solo sale por el
 * detalle del hogar, {@code GET /api/v1/households/{householdId}}.
 */
@Schema(name = "HouseholdSummary", description = "Hogar del usuario, con su rol y el tamaño del grupo.")
public record HouseholdSummaryResponse(

        @Schema(description = "Identificador del hogar.", example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
        UUID id,

        @Schema(description = "Nombre del hogar.", example = "Casa Rivas")
        String name,

        @Schema(description = "Rol del usuario autenticado en este hogar.", example = "ADMIN")
        HouseholdRole role,

        @Schema(description = "Número de personas que pertenecen al hogar.", example = "3")
        long memberCount
) {
}
