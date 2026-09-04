package com.cellier.household;

import com.cellier.household.domain.Household;
import com.cellier.household.domain.HouseholdMember;
import com.cellier.household.dto.CreateHouseholdRequest;
import com.cellier.household.dto.HouseholdDetailResponse;
import com.cellier.household.dto.HouseholdSummaryResponse;
import com.cellier.household.dto.JoinCodeResponse;
import com.cellier.household.dto.UpdateHouseholdRequest;
import com.cellier.identity.CurrentUserService;
import com.cellier.identity.domain.User;
import com.cellier.shared.error.NotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/** Casos de uso sobre el hogar como tal. La membresía se gobierna en sus propios servicios. */
@Service
public class HouseholdService {

    private static final Logger log = LoggerFactory.getLogger(HouseholdService.class);

    /**
     * Intentos de generar un código libre antes de rendirse. Con 8,5·10¹¹ combinaciones, que
     * fallen cinco seguidos es prácticamente imposible salvo que el generador esté roto, y en
     * ese caso es mejor un error ruidoso que un bucle infinito.
     */
    private static final int MAX_JOIN_CODE_ATTEMPTS = 5;

    private final HouseholdRepository households;
    private final HouseholdMemberRepository members;
    private final HouseholdAccessService access;
    private final CurrentUserService currentUserService;
    private final JoinCodeGenerator joinCodes;

    public HouseholdService(HouseholdRepository households,
                            HouseholdMemberRepository members,
                            HouseholdAccessService access,
                            CurrentUserService currentUserService,
                            JoinCodeGenerator joinCodes) {
        this.households = households;
        this.members = members;
        this.access = access;
        this.currentUserService = currentUserService;
        this.joinCodes = joinCodes;
    }

    /** Los hogares a los que pertenece el usuario autenticado. */
    @Transactional(readOnly = true)
    public List<HouseholdSummaryResponse> listMine() {
        return members.findSummariesByUserId(currentUserId());
    }

    /**
     * Crea un hogar y deja a su creador dentro como administrador (R1).
     *
     * <p>Las dos escrituras van en la misma transacción a propósito: un hogar sin
     * administrador sería inadministrable y, por el 404 del guardia, invisible incluso para
     * quien lo creó.
     */
    @Transactional
    public HouseholdDetailResponse create(CreateHouseholdRequest request) {
        User creator = currentUserService.requireCurrentUser();

        Household household = households.save(
                Household.create(request.name().trim(), allocateJoinCode(), creator));
        members.save(HouseholdMember.admin(household, creator));

        return detailFor(household.getId(), creator.getId());
    }

    @Transactional(readOnly = true)
    public HouseholdDetailResponse get(UUID householdId) {
        UUID userId = currentUserId();
        access.requireMember(userId, householdId);
        return detailFor(householdId, userId);
    }

    @Transactional
    public HouseholdDetailResponse rename(UUID householdId, UpdateHouseholdRequest request) {
        UUID userId = currentUserId();
        HouseholdMember membership = access.requireAdmin(userId, householdId);

        membership.getHousehold().rename(request.name().trim());

        return detailFor(householdId, userId);
    }

    /**
     * Borra el hogar con todo su contenido (R7).
     *
     * <p>El borrado en cascada lo hace la base de datos, no JPA. Es deliberado: las tablas
     * que cuelgan del hogar irán creciendo con cada módulo nuevo —despensa, catálogo,
     * plantillas, recetas— y una cascada declarada en el esquema las cubre a todas sin que
     * este servicio tenga que enterarse de cada una.
     */
    @Transactional
    public void delete(UUID householdId) {
        UUID userId = currentUserId();
        HouseholdMember membership = access.requireAdmin(userId, householdId);

        households.delete(membership.getHousehold());
    }

    /** Sustituye el código de ingreso. El anterior deja de servir en el acto. */
    @Transactional
    public JoinCodeResponse regenerateJoinCode(UUID householdId) {
        UUID userId = currentUserId();
        HouseholdMember membership = access.requireAdmin(userId, householdId);

        Household household = membership.getHousehold();
        household.assignJoinCode(allocateJoinCode());

        return new JoinCodeResponse(household.getJoinCode());
    }

    /**
     * Un código que hoy no está en uso.
     *
     * <p>La comprobación previa no es la garantía de unicidad —entre la consulta y el INSERT
     * cabe otra transacción—, sino la forma de no depender de que la colisión ocurra: la
     * garantía real es el índice único de la columna, y con este espacio de códigos la
     * carrera es tan improbable que no compensa gestionarla con reintentos sobre una
     * transacción ya abortada.
     */
    private String allocateJoinCode() {
        for (int intento = 0; intento < MAX_JOIN_CODE_ATTEMPTS; intento++) {
            String candidate = joinCodes.next();
            if (!households.existsByJoinCode(candidate)) {
                return candidate;
            }
            log.warn("Colisión al generar un código de ingreso; reintentando ({}/{})",
                    intento + 1, MAX_JOIN_CODE_ATTEMPTS);
        }
        throw new IllegalStateException(
                "No se pudo generar un código de ingreso libre en " + MAX_JOIN_CODE_ATTEMPTS + " intentos.");
    }

    /**
     * Relee el detalle desde la base para devolver siempre la misma forma, con el recuento de
     * miembros ya calculado. Hibernate vuelca los cambios pendientes antes de resolver la
     * consulta, así que tras un alta o un renombrado lo que sale de aquí es el estado nuevo.
     */
    private HouseholdDetailResponse detailFor(UUID householdId, UUID userId) {
        return households.findDetailFor(householdId, userId)
                .orElseThrow(() -> new NotFoundException(HouseholdAccessService.HOUSEHOLD_NOT_FOUND));
    }

    private UUID currentUserId() {
        return currentUserService.requirePrincipal().userId();
    }
}
