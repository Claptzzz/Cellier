package com.cellier.household.domain;

import com.cellier.identity.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * La petición de alguien para entrar en un hogar.
 *
 * <p>Existe porque conocer el código de ingreso <strong>no da acceso</strong>: abre esta
 * solicitud, y hace falta que un administrador la apruebe para que nazca la membresía. El
 * código puede acabar en un grupo de mensajería o en una foto; la aprobación es el punto en
 * el que una persona decide.
 *
 * <p>Solo {@link JoinRequestStatus#PENDING} es un estado vivo. Los otros tres son finales y
 * llevan siempre quién y cuándo los provocó: la base lo exige con
 * {@code ck_join_requests_resolution}, de modo que no puede existir una solicitud resuelta sin
 * constancia de su resolución.
 *
 * <p>Una solicitud resuelta es un hecho histórico y <strong>no dice quién es miembro hoy</strong>:
 * una {@code APPROVED} sobrevive a la expulsión de la persona que dejó entrar. La única fuente
 * de la membresía es {@link HouseholdMember}.
 */
@Entity
@Table(name = "join_requests")
public class JoinRequest {

    @Id
    @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false, updatable = false)
    private Household household;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, updatable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private JoinRequestStatus status;

    @CreationTimestamp
    @Column(name = "requested_at", nullable = false, updatable = false)
    private Instant requestedAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resolved_by")
    private User resolvedBy;

    protected JoinRequest() {
        // Requerido por JPA.
    }

    private JoinRequest(Household household, User user) {
        this.household = household;
        this.user = user;
        this.status = JoinRequestStatus.PENDING;
    }

    public static JoinRequest open(Household household, User user) {
        return new JoinRequest(household, user);
    }

    /** La aprueba un administrador: a partir de aquí la persona entra en el hogar. */
    public void approve(User admin, Instant at) {
        resolve(JoinRequestStatus.APPROVED, admin, at);
    }

    /** La deniega un administrador. La persona puede volver a solicitar. */
    public void reject(User admin, Instant at) {
        resolve(JoinRequestStatus.REJECTED, admin, at);
    }

    /**
     * El propio solicitante se echa atrás. Queda como resolutor él mismo: la columna guarda
     * quién cerró la solicitud, y en una cancelación es quien la abrió.
     */
    public void cancel(Instant at) {
        resolve(JoinRequestStatus.CANCELLED, user, at);
    }

    private void resolve(JoinRequestStatus outcome, User resolver, Instant at) {
        this.status = outcome;
        this.resolvedBy = resolver;
        this.resolvedAt = at;
    }

    public boolean isPending() {
        return status == JoinRequestStatus.PENDING;
    }

    public UUID getId() {
        return id;
    }

    public Household getHousehold() {
        return household;
    }

    public User getUser() {
        return user;
    }

    public JoinRequestStatus getStatus() {
        return status;
    }

    public Instant getRequestedAt() {
        return requestedAt;
    }

    public Instant getResolvedAt() {
        return resolvedAt;
    }

    public User getResolvedBy() {
        return resolvedBy;
    }
}
