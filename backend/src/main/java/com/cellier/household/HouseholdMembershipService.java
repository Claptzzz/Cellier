package com.cellier.household;

import com.cellier.household.domain.HouseholdMember;
import com.cellier.household.domain.HouseholdRole;
import com.cellier.household.dto.HouseholdMemberResponse;
import com.cellier.household.dto.UpdateMemberRoleRequest;
import com.cellier.identity.CurrentUserService;
import com.cellier.shared.error.ConflictException;
import com.cellier.shared.error.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Quién pertenece a un hogar y con qué rol.
 *
 * <p>Todas las operaciones que modifican la membresía comparten una invariante que no vive en
 * ninguna fila concreta sino en el conjunto: <strong>el hogar conserva siempre al menos un
 * administrador</strong> (R4). Por eso todas empiezan bloqueando la fila del hogar, y solo
 * después leen el recuento de administradores sobre el que deciden.
 */
@Service
public class HouseholdMembershipService {

    private static final String LAST_ADMIN_ON_DEMOTE =
            "El hogar debe conservar al menos un administrador. Promueve a otro miembro antes de quitarle el rol a este.";

    private static final String LAST_ADMIN_ON_LEAVE =
            "El hogar debe conservar al menos un administrador. Promueve a otro miembro antes de salir, o elimina el hogar.";

    private static final String MEMBER_NOT_FOUND = "Esa persona no pertenece a este hogar.";

    private final HouseholdRepository households;
    private final HouseholdMemberRepository members;
    private final HouseholdAccessService access;
    private final CurrentUserService currentUserService;

    public HouseholdMembershipService(HouseholdRepository households,
                                      HouseholdMemberRepository members,
                                      HouseholdAccessService access,
                                      CurrentUserService currentUserService) {
        this.households = households;
        this.members = members;
        this.access = access;
        this.currentUserService = currentUserService;
    }

    /** Las personas del hogar. Lo puede consultar cualquier miembro, con cualquier rol. */
    @Transactional(readOnly = true)
    public List<HouseholdMemberResponse> list(UUID householdId) {
        access.requireMember(currentUserId(), householdId);
        return members.findMembersOf(householdId, HouseholdRole.ADMIN);
    }

    /**
     * Cambia el rol de un miembro. Solo un administrador puede hacerlo, y no a costa de dejar
     * al hogar sin ninguno (R4).
     */
    @Transactional
    public HouseholdMemberResponse changeRole(UUID householdId, UUID targetUserId, UpdateMemberRoleRequest request) {
        access.requireAdmin(currentUserId(), householdId);

        lockHousehold(householdId);
        HouseholdMember target = requireMemberOf(householdId, targetUserId);

        if (target.getRole() != request.role()) {
            if (target.isAdmin() && isLastAdmin(householdId)) {
                throw new ConflictException(LAST_ADMIN_ON_DEMOTE);
            }
            target.changeRole(request.role());
        }

        return toResponse(householdId, targetUserId);
    }

    /**
     * Saca a alguien del hogar: un administrador expulsando a otra persona, o cualquier
     * miembro saliéndose por su cuenta (R6). En ambos casos rige R4.
     *
     * <p>El guardia se resuelve en dos pasos porque los permisos difieren según a quién se
     * saque: pertenecer al hogar basta para salirse, pero hace falta ser administrador para
     * expulsar a otro. Un miembro sin rol que intenta expulsar recibe 403, no 404: ya sabía
     * que el hogar existe, así que no hay nada que ocultarle.
     *
     * <p>De esos dos permisos se deduce que R4 solo puede saltar en una salida voluntaria:
     * expulsar al último administrador exigiría que quien llama fuese administrador y no lo
     * fuese a la vez.
     */
    @Transactional
    public void remove(UUID householdId, UUID targetUserId) {
        UUID actorId = currentUserId();
        access.requireMember(actorId, householdId);

        boolean leavingOnOwn = actorId.equals(targetUserId);
        if (!leavingOnOwn) {
            access.requireAdmin(actorId, householdId);
        }

        lockHousehold(householdId);
        HouseholdMember target = requireMemberOf(householdId, targetUserId);

        if (target.isAdmin() && isLastAdmin(householdId)) {
            // Aquí solo se llega saliéndose uno mismo, nunca expulsando: para expulsar a otro
            // hay que ser administrador, y si el objetivo es el último administrador entonces
            // quien llama no lo es. Un mensaje sobre expulsiones sería inalcanzable.
            throw new ConflictException(LAST_ADMIN_ON_LEAVE);
        }

        members.delete(target);
    }

    /**
     * Serializa los cambios de membresía del hogar. Debe llamarse <em>antes</em> de contar
     * administradores: bloquear después de leer no evitaría nada.
     */
    private void lockHousehold(UUID householdId) {
        households.findByIdForUpdate(householdId)
                .orElseThrow(() -> new NotFoundException(HouseholdAccessService.HOUSEHOLD_NOT_FOUND));
    }

    /**
     * La membresía de la persona sobre la que se actúa.
     *
     * <p>El 404 aquí no oculta el hogar —quien llama ya ha demostrado pertenecer a él— sino
     * que dice que esa persona concreta no está dentro.
     */
    private HouseholdMember requireMemberOf(UUID householdId, UUID targetUserId) {
        return members.findByHouseholdIdAndUserId(householdId, targetUserId)
                .orElseThrow(() -> new NotFoundException(MEMBER_NOT_FOUND));
    }

    private boolean isLastAdmin(UUID householdId) {
        return members.countByHouseholdIdAndRole(householdId, HouseholdRole.ADMIN) <= 1;
    }

    /**
     * Relee la fila ya modificada para devolver la misma forma que el listado. Hibernate
     * vuelca el cambio de rol antes de resolver la consulta, así que sale el estado nuevo.
     */
    private HouseholdMemberResponse toResponse(UUID householdId, UUID targetUserId) {
        return members.findMemberOf(householdId, targetUserId)
                .orElseThrow(() -> new NotFoundException(MEMBER_NOT_FOUND));
    }

    private UUID currentUserId() {
        return currentUserService.requirePrincipal().userId();
    }
}
