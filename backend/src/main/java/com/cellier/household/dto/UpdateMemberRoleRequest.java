package com.cellier.household.dto;

import com.cellier.household.domain.HouseholdRole;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

@Schema(name = "UpdateMemberRoleRequest", description = "Nuevo rol de un miembro del hogar.")
public record UpdateMemberRoleRequest(

        @Schema(description = "Rol a asignar.", example = "ADMIN", allowableValues = {"ADMIN", "MEMBER"})
        @NotNull(message = "El rol es obligatorio")
        HouseholdRole role
) {
}
