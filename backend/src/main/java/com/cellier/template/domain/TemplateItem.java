package com.cellier.template.domain;

import com.cellier.catalog.domain.Product;
import com.cellier.household.domain.Household;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

/**
 * Una línea de una plantilla: de este producto, tanta cantidad.
 *
 * <p>La cantidad va en la unidad canónica del producto, como todas las del sistema. Comparar
 * lo deseado con lo que hay es una resta.
 *
 * <p><strong>Lleva {@code household_id} propio</strong>, y no es redundancia por simetría:
 * es lo que permite que las dos claves foráneas apunten al par {@code (id, household_id)}.
 * Sin eso, nada en la base impediría una fila cuya plantilla es de un hogar y cuyo producto
 * es de otro, y el reporte pediría comprar algo que en ese hogar no existe, sin que nada
 * fallara. Ver la nota final de {@code V5__templates.sql}.
 */
@Entity
@Table(name = "template_items")
public class TemplateItem {

    /** Tres decimales, los mismos que la despensa: restar exige la misma escala. */
    private static final int SCALE = 3;

    @Id
    @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false, updatable = false)
    private Household household;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "template_id", nullable = false, updatable = false)
    private PantryTemplate template;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false, updatable = false)
    private Product product;

    @Column(name = "desired_quantity", nullable = false)
    private BigDecimal desiredQuantity;

    protected TemplateItem() {
        // Requerido por JPA.
    }

    private TemplateItem(PantryTemplate template, Product product, BigDecimal desiredQuantity) {
        this.template = template;
        this.household = template.getHousehold();
        this.product = product;
        this.desiredQuantity = normalize(desiredQuantity);
    }

    public static TemplateItem of(PantryTemplate template, Product product, BigDecimal desiredQuantity) {
        return new TemplateItem(template, product, desiredQuantity);
    }

    private static BigDecimal normalize(BigDecimal value) {
        return value.setScale(SCALE, RoundingMode.HALF_UP);
    }

    /**
     * Cambia cuánto se quiere tener.
     *
     * <p>Lo que se edita es la cantidad, nunca el producto: una línea que cambiara de producto
     * sería otra línea, y como el producto fija la unidad, cambiarlo reinterpretaría la cifra.
     */
    public void want(BigDecimal desiredQuantity) {
        this.desiredQuantity = normalize(desiredQuantity);
    }

    public UUID getId() {
        return id;
    }

    public PantryTemplate getTemplate() {
        return template;
    }

    public Product getProduct() {
        return product;
    }

    public BigDecimal getDesiredQuantity() {
        return desiredQuantity;
    }
}
