package com.cellier.identity;

import com.cellier.identity.domain.User;
import com.cellier.identity.dto.UserProfileResponse;
import org.mapstruct.Mapper;

/** Conversión de la entidad al DTO de salida. Las entidades no cruzan la capa web. */
@Mapper
public interface UserMapper {

    UserProfileResponse toProfile(User user);
}
