package com.cellier.catalog.domain;

import com.cellier.household.domain.Household;
import com.cellier.shared.audit.AuditableEntity;
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

import java.util.UUID;

/**
 * Un producto del catálogo de un hogar: qué es y en qué unidad se mide.
 *
 * <p>El catálogo es por hogar, no global. Dos casas pueden llamar «Leche» a cosas distintas
 * y medirlas distinto, y ninguna tiene por qué ponerse de acuerdo con la otra.
 *
 * <p>El nombre es único dentro del hogar <strong>sin distinguir mayúsculas</strong>: «Leche»
 * y «leche» son el mismo producto. La columna conserva lo que escribió la persona; la
 * unicidad la impone un índice funcional sobre {@code lower(name)}.
 */
@Entity
@Table(name = "products")
public class Product extends AuditableEntity {

    @Id
    @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false, updatable = false)
    private Household household;

    @Column(name = "name", nullable = false)
    private String name;

    /**
     * No tiene mutador a propósito. Cambiar la unidad reinterpreta en silencio todas las
     * cantidades ya registradas: 2 pasaría de dos litros a dos gramos sin que nada en la
     * despensa cambie de aspecto. Quien se equivoca de unidad crea otro producto.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "unit", nullable = false, updatable = false)
    private ProductUnit unit;

    @Column(name = "category")
    private String category;

    protected Product() {
        // Requerido por JPA.
    }

    private Product(Household household, String name, ProductUnit unit, String category) {
        this.household = household;
        this.name = name;
        this.unit = unit;
        this.category = category;
    }

    public static Product create(Household household, String name, ProductUnit unit, String category) {
        return new Product(household, name, unit, category);
    }

    /** Sólo el nombre y la categoría se editan. La unidad, no: ver el campo. */
    public void rename(String name) {
        this.name = name;
    }

    public void recategorize(String category) {
        this.category = category;
    }

    public UUID getId() {
        return id;
    }

    public Household getHousehold() {
        return household;
    }

    public String getName() {
        return name;
    }

    public ProductUnit getUnit() {
        return unit;
    }

    public String getCategory() {
        return category;
    }
}
