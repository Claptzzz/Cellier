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
 * La pertenencia de un usuario a un hogar, con su rol.
 *
 * <p>Es la única fuente de autorización del sistema: si no hay fila, el hogar no existe a
 * ojos de ese usuario. Nace por una de dos vías, y solo por esas dos: crear el hogar
 * (el creador queda como {@link HouseholdRole#ADMIN}) o que un administrador apruebe una
 * solicitud de ingreso.
 */
@Entity
@Table(name = "household_members")
public class HouseholdMember {

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
    @Column(name = "role", nullable = false)
    private HouseholdRole role;

    @CreationTimestamp
    @Column(name = "joined_at", nullable = false, updatable = false)
    private Instant joinedAt;

    protected HouseholdMember() {
        // Requerido por JPA.
    }

    private HouseholdMember(Household household, User user, HouseholdRole role) {
        this.household = household;
        this.user = user;
        this.role = role;
    }

    /** Membresía de quien crea el hogar: siempre administrador. */
    public static HouseholdMember admin(Household household, User user) {
        return new HouseholdMember(household, user, HouseholdRole.ADMIN);
    }

    /** Membresía de quien entra por una solicitud aprobada. */
    public static HouseholdMember member(Household household, User user) {
        return new HouseholdMember(household, user, HouseholdRole.MEMBER);
    }

    public void changeRole(HouseholdRole role) {
        this.role = role;
    }

    public boolean isAdmin() {
        return role == HouseholdRole.ADMIN;
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

    public HouseholdRole getRole() {
        return role;
    }

    public Instant getJoinedAt() {
        return joinedAt;
    }
}
