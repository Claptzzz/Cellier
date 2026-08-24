package com.cellier.identity;

import com.cellier.identity.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    /** Solo devuelve usuarios activos: un usuario borrado no puede autenticarse. */
    Optional<User> findByGoogleSubAndDeletedAtIsNull(String googleSub);

    Optional<User> findByIdAndDeletedAtIsNull(UUID id);
}
