package com.cellier.pantry.domain;

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

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Un cambio de cantidad, con quién lo hizo y cuándo.
 *
 * <p>Es un registro histórico: no se edita ni se borra salvo cuando desaparece el artículo
 * entero. Por eso {@code performedBy} es nullable —el movimiento sobrevive a su autor— y
 * todas sus columnas son de sólo lectura.
 *
 * <p>La suma de los deltas de un artículo es su cantidad actual. Esa es la razón de que
 * consumir registre lo que se gastó de verdad y no lo que se pidió, y de que un ajuste que
 * no cambia nada no escriba fila.
 */
@Entity
@Table(name = "stock_movements")
public class StockMovement {

    @Id
    @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "pantry_item_id", nullable = false, updatable = false)
    private PantryItem item;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, updatable = false)
    private MovementType type;

    @Column(name = "delta", nullable = false, updatable = false)
    private BigDecimal delta;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "performed_by", updatable = false)
    private User performedBy;

    @CreationTimestamp
    @Column(name = "performed_at", nullable = false, updatable = false)
    private Instant performedAt;

    protected StockMovement() {
        // Requerido por JPA.
    }

    private StockMovement(PantryItem item, MovementType type, BigDecimal delta, User performedBy) {
        this.item = item;
        this.type = type;
        this.delta = delta;
        this.performedBy = performedBy;
    }

    public static StockMovement of(PantryItem item, MovementType type, BigDecimal delta, User performedBy) {
        return new StockMovement(item, type, delta, performedBy);
    }

    public UUID getId() {
        return id;
    }

    public PantryItem getItem() {
        return item;
    }

    public MovementType getType() {
        return type;
    }

    public BigDecimal getDelta() {
        return delta;
    }

    public User getPerformedBy() {
        return performedBy;
    }

    public Instant getPerformedAt() {
        return performedAt;
    }
}
