package com.cellier.household;

import com.cellier.household.domain.HouseholdMember;
import com.cellier.shared.error.ForbiddenException;
import com.cellier.shared.error.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * El guardia central de Cellier. Todo caso de uso con ámbito de hogar —en este módulo y en
 * los que vengan: despensa, catálogo, plantillas, recetas— empieza llamando aquí, antes de
 * leer o escribir un solo dato.
 *
 * <p><strong>Un hogar al que no pertenezco responde 404, nunca 403.</strong> La diferencia
 * no es cosmética: un 403 confirmaría que ese identificador corresponde a un hogar real, y
 * con eso se puede sondear qué hogares existen y cuáles no. Para quien no es miembro, el
 * hogar sencillamente no está. El 403 se reserva para quien sí es miembro pero se queda
 * corto de rol, un caso en el que ya no se revela nada que el usuario no supiera.
 */
@Service
public class HouseholdAccessService {

    /**
     * Un único texto para las dos situaciones. Si el mensaje distinguiera «no existe» de «no
     * eres miembro», el 404 dejaría de proteger nada.
     */
    static final String HOUSEHOLD_NOT_FOUND = "No existe ese hogar, o no eres miembro de él.";

    static final String ADMIN_REQUIRED = "Esta operación requiere rol de administrador en el hogar.";

    private final HouseholdMemberRepository members;

    public HouseholdAccessService(HouseholdMemberRepository members) {
        this.members = members;
    }

    /**
     * @return la membresía del usuario en ese hogar
     * @throws NotFoundException si el hogar no existe, o si existe pero el usuario no
     *         pertenece a él: ambos casos son indistinguibles desde fuera
     */
    @Transactional(readOnly = true)
    public HouseholdMember requireMember(UUID userId, UUID householdId) {
        return members.findByHouseholdIdAndUserId(householdId, userId)
                .orElseThrow(() -> new NotFoundException(HOUSEHOLD_NOT_FOUND));
    }

    /**
     * @return la membresía del usuario, garantizada de rol ADMIN
     * @throws NotFoundException si el hogar no existe o el usuario no es miembro
     * @throws ForbiddenException si es miembro pero no administrador
     */
    @Transactional(readOnly = true)
    public HouseholdMember requireAdmin(UUID userId, UUID householdId) {
        HouseholdMember membership = requireMember(userId, householdId);
        if (!membership.isAdmin()) {
            throw new ForbiddenException(ADMIN_REQUIRED);
        }
        return membership;
    }
}
