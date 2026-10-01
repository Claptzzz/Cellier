package com.cellier.identity;

import java.util.UUID;

/**
 * Sale de todos los hogares del usuario al darse de baja la cuenta.
 *
 * <p>Mismo puerto invertido que {@link UserHouseholdsView} y por la misma razón: identity no
 * puede llamar a household directamente, así que declara aquí lo que necesita y household lo
 * implementa.
 */
public interface UserHouseholdOffboarding {

    /**
     * Elimina la membresía del usuario en todos sus hogares.
     *
     * @throws com.cellier.shared.error.ConflictException si el usuario es el único
     *         administrador de alguno de ellos; en ese caso no sale de ninguno.
     */
    void leaveAllHouseholds(UUID userId);
}
