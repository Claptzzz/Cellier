package com.cellier.household.domain;

import com.cellier.identity.domain.User;
import com.cellier.shared.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.util.UUID;

/**
 * Un hogar: la despensa compartida por un grupo de personas y el ámbito al que pertenece
 * todo el resto del dominio.
 *
 * <p>El hogar no conoce a sus miembros como una colección. La relación vive únicamente en
 * {@link HouseholdMember}, del lado que la consulta: cargar un hogar es una operación
 * constante, no una que arrastre a todo el grupo, y las comprobaciones de autorización
 * preguntan siempre por una sola membresía.
 */
@Entity
@Table(name = "households")
public class Household extends AuditableEntity {

    @Id
    @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "join_code", nullable = false, length = 8)
    private String joinCode;

    /**
     * Quién creó el hogar. Es un dato histórico, no una fuente de permisos: el creador puede
     * acabar fuera del hogar. Quien manda es la fila de {@link HouseholdMember}.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by", nullable = false, updatable = false)
    private User createdBy;

    protected Household() {
        // Requerido por JPA.
    }

    private Household(String name, String joinCode, User createdBy) {
        this.name = name;
        this.joinCode = joinCode;
        this.createdBy = createdBy;
    }

    public static Household create(String name, String joinCode, User createdBy) {
        return new Household(name, joinCode, createdBy);
    }

    public void rename(String name) {
        this.name = name;
    }

    /**
     * Sustituye el código de ingreso. El anterior deja de servir en el acto, que es justo el
     * motivo por el que un administrador regenera el código.
     */
    public void assignJoinCode(String joinCode) {
        this.joinCode = joinCode;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getJoinCode() {
        return joinCode;
    }

    public User getCreatedBy() {
        return createdBy;
    }
}
