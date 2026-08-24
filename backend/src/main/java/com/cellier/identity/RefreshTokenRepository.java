package com.cellier.identity;

import com.cellier.identity.domain.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

    Optional<RefreshToken> findByTokenHash(String tokenHash);

    /** Revoca de golpe todas las sesiones vivas de un usuario. */
    @Modifying
    @Query("""
            update RefreshToken t
               set t.revokedAt = :at
             where t.user.id = :userId
               and t.revokedAt is null
            """)
    int revokeAllForUser(@Param("userId") UUID userId, @Param("at") Instant at);
}
