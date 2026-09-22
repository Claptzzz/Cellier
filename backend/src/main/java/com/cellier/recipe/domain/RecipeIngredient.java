package com.cellier.recipe.domain;

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
 * Una línea de una receta: de este producto, tanta cantidad, opcional o no.
 *
 * <p>La cantidad va en la unidad canónica del producto, como todas las del sistema. Comparar
 * lo que hace falta con lo que hay es una resta, igual que en las plantillas.
 *
 * <p><strong>Un ingrediente opcional no cuenta para la disponibilidad.</strong> "Sal al
 * gusto" no puede dejar la receta entera en falta porque el bote esté vacío; ver
 * {@code docs/reglas-recetas.md}.
 *
 * <p>Lleva {@code household_id} propio por la misma razón que {@code TemplateItem}: es lo que
 * permite que las dos claves foráneas apunten al par {@code (id, household_id)} y hagan
 * imposible por construcción una fila cuya receta es de un hogar y cuyo producto es de otro.
 */
@Entity
@Table(name = "recipe_ingredients")
public class RecipeIngredient {

    /** Tres decimales, los mismos que la despensa y las plantillas. */
    private static final int SCALE = 3;

    @Id
    @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false, updatable = false)
    private Household household;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipe_id", nullable = false, updatable = false)
    private Recipe recipe;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false, updatable = false)
    private Product product;

    @Column(name = "quantity", nullable = false)
    private BigDecimal quantity;

    @Column(name = "optional", nullable = false)
    private boolean optional;

    protected RecipeIngredient() {
        // Requerido por JPA.
    }

    private RecipeIngredient(Recipe recipe, Product product, BigDecimal quantity, boolean optional) {
        this.recipe = recipe;
        this.household = recipe.getHousehold();
        this.product = product;
        this.quantity = normalize(quantity);
        this.optional = optional;
    }

    public static RecipeIngredient of(Recipe recipe, Product product, BigDecimal quantity, boolean optional) {
        return new RecipeIngredient(recipe, product, quantity, optional);
    }

    private static BigDecimal normalize(BigDecimal value) {
        return value.setScale(SCALE, RoundingMode.HALF_UP);
    }

    /**
     * Cambia cuánto hace falta y si es opcional. Lo que se edita es la cantidad y la
     * condición, nunca el producto: una línea que cambiara de producto sería otra línea.
     */
    public void update(BigDecimal quantity, boolean optional) {
        this.quantity = normalize(quantity);
        this.optional = optional;
    }

    public UUID getId() {
        return id;
    }

    public Recipe getRecipe() {
        return recipe;
    }

    public Product getProduct() {
        return product;
    }

    public BigDecimal getQuantity() {
        return quantity;
    }

    public boolean isOptional() {
        return optional;
    }
}
