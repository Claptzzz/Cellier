package com.cellier.pantry.domain;

import com.cellier.catalog.domain.Product;
import com.cellier.household.domain.Household;
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
import jakarta.persistence.Version;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Lo que hay de un producto en la despensa de un hogar.
 *
 * <p>Una fila por producto y por hogar. La cantidad se expresa siempre en la unidad canónica
 * del producto, porque no hay conversión: por eso comparar lo que hay con lo que hace falta
 * es una resta.
 *
 * <p><strong>Lleva bloqueo optimista.</strong> Dos personas ajustando el mismo producto a la
 * vez es lo normal en una casa, no una rareza: alguien apunta que gastó medio litro mientras
 * otro registra la compra. Sin {@code @Version}, la segunda escritura pisa a la primera y la
 * cantidad resultante es falsa sin que nadie se entere. Con él, quien pierde recibe un 409 y
 * puede recargar.
 */
@Entity
@Table(name = "pantry_items")
public class PantryItem {

    /**
     * La escala de la columna. Las cantidades se normalizan a tres decimales al escribirlas,
     * en vez de dejar que la base redondee en silencio lo que llegue con más.
     */
    private static final int ESCALA = 3;

    @Id
    @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false, updatable = false)
    private Household household;

    /**
     * El producto. La base exige además que pertenezca al mismo hogar que este artículo, con
     * una clave foránea al par {@code (id, household_id)}: ver {@code docs/reglas-esquema.md}.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false, updatable = false)
    private Product product;

    @Column(name = "quantity", nullable = false)
    private BigDecimal quantity;

    @Column(name = "expires_at")
    private LocalDate expiresAt;

    @Column(name = "par_level")
    private BigDecimal parLevel;

    @Enumerated(EnumType.STRING)
    @Column(name = "storage_location")
    private StorageLocation storageLocation;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected PantryItem() {
        // Requerido por JPA.
    }

    private PantryItem(Household household, Product product, BigDecimal quantity) {
        this.household = household;
        this.product = product;
        this.quantity = normalize(quantity);
    }

    public static PantryItem of(Household household, Product product, BigDecimal quantity) {
        return new PantryItem(household, product, quantity);
    }

    /**
     * Gasta producto, <strong>con piso en cero</strong>.
     *
     * @return cuánto se gastó de verdad, en negativo, listo para el movimiento. Puede ser
     *         menos de lo pedido: consumir tres litros cuando quedaba uno deja cero y
     *         registra que se gastó uno, porque es lo único que había. Registrar los tres
     *         haría que la suma de movimientos dejara de cuadrar con la cantidad.
     */
    public BigDecimal consume(BigDecimal amount) {
        BigDecimal pedido = normalize(amount);
        BigDecimal gastado = pedido.min(quantity);
        quantity = quantity.subtract(gastado);
        return gastado.negate();
    }

    /** Repone producto. @return el delta, en positivo. */
    public BigDecimal restock(BigDecimal amount) {
        BigDecimal repuesto = normalize(amount);
        quantity = quantity.add(repuesto);
        return repuesto;
    }

    /**
     * Fija la cantidad a un valor contado a mano.
     *
     * @return la diferencia respecto de lo que había, o {@code null} si no cambió nada. Un
     *         ajuste que no mueve la cantidad no es un movimiento y no debe escribir fila:
     *         la base lo rechazaría igualmente con {@code ck_stock_movements_sign}.
     */
    public BigDecimal adjustTo(BigDecimal target) {
        BigDecimal nueva = normalize(target);
        BigDecimal delta = nueva.subtract(quantity);
        quantity = nueva;
        return delta.signum() == 0 ? null : delta;
    }

    public void setExpiresAt(LocalDate expiresAt) {
        this.expiresAt = expiresAt;
    }

    public void setParLevel(BigDecimal parLevel) {
        this.parLevel = parLevel == null ? null : normalize(parLevel);
    }

    public void setStorageLocation(StorageLocation storageLocation) {
        this.storageLocation = storageLocation;
    }

    private static BigDecimal normalize(BigDecimal value) {
        return value.setScale(ESCALA, RoundingMode.HALF_UP);
    }

    public UUID getId() {
        return id;
    }

    public Household getHousehold() {
        return household;
    }

    public Product getProduct() {
        return product;
    }

    public BigDecimal getQuantity() {
        return quantity;
    }

    public LocalDate getExpiresAt() {
        return expiresAt;
    }

    public BigDecimal getParLevel() {
        return parLevel;
    }

    public StorageLocation getStorageLocation() {
        return storageLocation;
    }

    public long getVersion() {
        return version;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
