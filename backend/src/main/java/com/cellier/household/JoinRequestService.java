package com.cellier.household;

import com.cellier.household.domain.Household;
import com.cellier.household.domain.HouseholdMember;
import com.cellier.household.domain.JoinRequest;
import com.cellier.household.domain.JoinRequestStatus;
import com.cellier.household.dto.CreateJoinRequestRequest;
import com.cellier.household.dto.JoinRequestResponse;
import com.cellier.household.dto.MyJoinRequestResponse;
import com.cellier.identity.CurrentUserService;
import com.cellier.identity.domain.User;
import com.cellier.shared.error.ConflictException;
import com.cellier.shared.error.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

/**
 * Solicitudes de ingreso: la única puerta de entrada a un hogar.
 *
 * <p>El código de ingreso no abre nada por sí mismo (R3). Quien lo teclea crea una solicitud
 * pendiente, y hace falta que un administrador la apruebe para que nazca la membresía. Esa
 * separación es deliberada: un código viaja en un mensaje o en una foto y acaba donde nadie
 * previó, mientras que la aprobación es un momento en el que una persona mira quién pide
 * entrar y decide.
 */
@Service
public class JoinRequestService {

    private static final String CODE_NOT_FOUND = "No hay ningún hogar con ese código de ingreso.";

    private static final String ALREADY_MEMBER = "Ya perteneces a ese hogar.";

    private static final String ALREADY_PENDING =
            "Ya tienes una solicitud pendiente en ese hogar. Espera a que un administrador la resuelva, o cancélala.";

    private static final String REQUEST_NOT_FOUND = "No existe esa solicitud.";

    private static final String REQUEST_NOT_IN_HOUSEHOLD = "No existe esa solicitud en este hogar.";

    private static final String ALREADY_RESOLVED = "Esa solicitud ya está resuelta.";

    private final HouseholdRepository households;
    private final HouseholdMemberRepository members;
    private final JoinRequestRepository joinRequests;
    private final HouseholdAccessService access;
    private final CurrentUserService currentUserService;
    private final Clock clock;

    public JoinRequestService(HouseholdRepository households,
                              HouseholdMemberRepository members,
                              JoinRequestRepository joinRequests,
                              HouseholdAccessService access,
                              CurrentUserService currentUserService,
                              Clock clock) {
        this.households = households;
        this.members = members;
        this.joinRequests = joinRequests;
        this.access = access;
        this.currentUserService = currentUserService;
        this.clock = clock;
    }

    /**
     * Pide entrar en el hogar de un código (R3).
     *
     * <p>No concede nada: deja una solicitud pendiente. Si quien la envía ya pertenece al
     * hogar, o ya tiene una pendiente allí, responde 409 en vez de acumular solicitudes (R5).
     */
    @Transactional
    public MyJoinRequestResponse create(CreateJoinRequestRequest request) {
        User applicant = currentUserService.requireCurrentUser();

        Household household = households.findByJoinCode(request.joinCode())
                .orElseThrow(() -> new NotFoundException(CODE_NOT_FOUND));

        if (members.findByHouseholdIdAndUserId(household.getId(), applicant.getId()).isPresent()) {
            throw new ConflictException(ALREADY_MEMBER);
        }
        if (joinRequests.existsByHouseholdIdAndUserIdAndStatus(
                household.getId(), applicant.getId(), JoinRequestStatus.PENDING)) {
            throw new ConflictException(ALREADY_PENDING);
        }

        JoinRequest created = joinRequests.save(JoinRequest.open(household, applicant));
        return new MyJoinRequestResponse(created.getId(), household.getId(), household.getName(),
                created.getStatus(), created.getRequestedAt(), created.getResolvedAt());
    }

    /** Las solicitudes que ha enviado el usuario autenticado, en cualquier estado. */
    @Transactional(readOnly = true)
    public List<MyJoinRequestResponse> listMine() {
        return joinRequests.findMine(currentUserId());
    }

    /**
     * El solicitante se echa atrás.
     *
     * <p>Solo puede cancelar quien la envió: un administrador no cancela solicitudes ajenas,
     * las <em>rechaza</em>, que es otra acción y deja otra huella en el historial. La
     * solicitud de otra persona responde 404 y no 403, igual que un hogar ajeno: quien
     * pregunta no debe poder averiguar que existe.
     *
     * <p>Al cancelarla, el índice único parcial queda libre y se puede volver a solicitar en
     * ese mismo hogar. Ese es el motivo de que este endpoint exista: sin él, quien teclea mal
     * un código queda bloqueado a la espera de que alguien rechace, en un hogar ajeno, una
     * solicitud que probablemente nadie mire.
     */
    @Transactional
    public void cancel(UUID joinRequestId) {
        JoinRequest request = joinRequests.findByIdAndUserId(joinRequestId, currentUserId())
                .orElseThrow(() -> new NotFoundException(REQUEST_NOT_FOUND));

        requirePending(request);
        request.cancel(clock.instant());
    }

    /** La bandeja del hogar. Solo la ve un administrador. */
    @Transactional(readOnly = true)
    public List<JoinRequestResponse> listForHousehold(UUID householdId, JoinRequestStatus status) {
        access.requireAdmin(currentUserId(), householdId);
        return status == null
                ? joinRequests.findForHousehold(householdId)
                : joinRequests.findForHouseholdByStatus(householdId, status);
    }

    /**
     * Aprueba la solicitud y crea la membresía en la misma transacción: es el único momento en
     * que alguien entra en un hogar sin haberlo creado.
     */
    @Transactional
    public JoinRequestResponse approve(UUID householdId, UUID joinRequestId) {
        User admin = currentUserService.requireCurrentUser();
        access.requireAdmin(admin.getId(), householdId);

        JoinRequest request = lockAndLoad(householdId, joinRequestId);
        requirePending(request);

        request.approve(admin, clock.instant());
        members.save(HouseholdMember.member(request.getHousehold(), request.getUser()));

        return projectionOf(joinRequestId);
    }

    /**
     * Deniega la solicitud. No crea membresía y no cierra la puerta: el índice único parcial
     * solo restringe las pendientes, así que la persona puede volver a pedirlo más adelante.
     */
    @Transactional
    public JoinRequestResponse reject(UUID householdId, UUID joinRequestId) {
        User admin = currentUserService.requireCurrentUser();
        access.requireAdmin(admin.getId(), householdId);

        JoinRequest request = lockAndLoad(householdId, joinRequestId);
        requirePending(request);

        request.reject(admin, clock.instant());

        return projectionOf(joinRequestId);
    }

    /**
     * Bloquea el hogar antes de leer la solicitud, para que dos administradores que resuelven
     * la misma a la vez no la resuelvan dos veces: el segundo la encuentra ya cerrada y recibe
     * un 409. Es el mismo punto de serialización que usa la membresía, por el mismo motivo.
     */
    private JoinRequest lockAndLoad(UUID householdId, UUID joinRequestId) {
        households.findByIdForUpdate(householdId)
                .orElseThrow(() -> new NotFoundException(HouseholdAccessService.HOUSEHOLD_NOT_FOUND));

        return joinRequests.findByIdAndHouseholdId(joinRequestId, householdId)
                .orElseThrow(() -> new NotFoundException(REQUEST_NOT_IN_HOUSEHOLD));
    }

    private void requirePending(JoinRequest request) {
        if (!request.isPending()) {
            throw new ConflictException(ALREADY_RESOLVED);
        }
    }

    private JoinRequestResponse projectionOf(UUID joinRequestId) {
        return joinRequests.findProjectionById(joinRequestId)
                .orElseThrow(() -> new NotFoundException(REQUEST_NOT_FOUND));
    }

    private UUID currentUserId() {
        return currentUserService.requirePrincipal().userId();
    }
}
