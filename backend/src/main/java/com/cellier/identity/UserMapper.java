package com.cellier.identity;

import com.cellier.household.dto.HouseholdSummaryResponse;
import com.cellier.identity.domain.User;
import com.cellier.identity.dto.UserProfileResponse;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import java.util.List;

/** Conversión de la entidad al DTO de salida. Las entidades no cruzan la capa web. */
@Mapper
public interface UserMapper {

    /**
     * Los hogares llegan como segundo parámetro, no de un getter de {@link User}: la entidad
     * no conoce sus hogares —la relación vive del lado de la membresía— y darle una colección
     * solo para esto convertiría cada carga de usuario en una consulta extra.
     */
    @Mapping(target = "households", source = "households")
    UserProfileResponse toProfile(User user, List<HouseholdSummaryResponse> households);
}
