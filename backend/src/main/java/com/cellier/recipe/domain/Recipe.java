package com.cellier.recipe.domain;

import com.cellier.household.domain.Household;
import com.cellier.identity.domain.User;
import com.cellier.shared.audit.AuditableEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Una receta del hogar: qué ingredientes hace falta y cómo se prepara.
 *
 * <p>Los ingredientes se cruzan contra la despensa para decidir si la receta está lista para
 * cocinarse ahora mismo; los pasos son sólo texto ordenado y nunca entran en ese cálculo.
 *
 * <p><strong>Quien la creó no manda sobre ella.</strong> {@code createdBy} es un dato, no una
 * autoridad: cualquier miembro del hogar puede editarla y borrarla, igual que las plantillas.
 */
@Entity
@Table(name = "recipes")
public class Recipe extends AuditableEntity {

    @Id
    @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false, updatable = false)
    private Household household;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "description")
    private String description;

    @Column(name = "servings")
    private Integer servings;

    @Column(name = "prep_minutes")
    private Integer prepMinutes;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @OneToMany(mappedBy = "recipe", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("id asc")
    private List<RecipeIngredient> ingredients = new ArrayList<>();

    @OneToMany(mappedBy = "recipe", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("position asc")
    private List<RecipeStep> steps = new ArrayList<>();

    protected Recipe() {
        // Requerido por JPA.
    }

    private Recipe(Household household, String name, String description, Integer servings,
                   Integer prepMinutes, User createdBy) {
        this.household = household;
        this.name = name;
        this.description = description;
        this.servings = servings;
        this.prepMinutes = prepMinutes;
        this.createdBy = createdBy;
    }

    public static Recipe create(Household household, String name, String description,
                                Integer servings, Integer prepMinutes, User createdBy) {
        return new Recipe(household, name, description, servings, prepMinutes, createdBy);
    }

    /**
     * Cambia nombre, descripción, raciones y minutos de preparación a la vez: el PUT
     * reemplaza la receta como un bloque, igual que reemplaza ingredientes y pasos.
     */
    public void updateDetails(String name, String description, Integer servings, Integer prepMinutes) {
        this.name = name;
        this.description = description;
        this.servings = servings;
        this.prepMinutes = prepMinutes;
    }

    /**
     * Reemplaza los ingredientes enteros. Reconcilia por producto en vez de vaciar y volver a
     * llenar, por la misma razón que {@code PantryTemplate.replaceItems}: Hibernate emite los
     * INSERT antes que los DELETE dentro de la misma descarga, y sustituir una lista por otra
     * que comparte productos chocaría contra {@code uq_recipe_ingredients_recipe_product}.
     */
    public void replaceIngredients(List<RecipeIngredient> replacement) {
        Map<UUID, RecipeIngredient> deseados = new LinkedHashMap<>();
        replacement.forEach((ingredient) -> deseados.put(ingredient.getProduct().getId(), ingredient));

        this.ingredients.removeIf((existing) -> !deseados.containsKey(existing.getProduct().getId()));
        this.ingredients.forEach((existing) -> {
            RecipeIngredient pedido = deseados.remove(existing.getProduct().getId());
            existing.update(pedido.getQuantity(), pedido.isOptional());
        });
        this.ingredients.addAll(deseados.values());
    }

    /**
     * Reemplaza los pasos enteros, reconciliando por posición: el paso que ya ocupaba el
     * índice N conserva su fila y sólo cambia de texto, y sólo se borran o se crean filas
     * cuando el nuevo recuento es menor o mayor que el anterior. Igual que con los
     * ingredientes, vaciar y volver a llenar chocaría contra
     * {@code uq_recipe_steps_recipe_position} por el orden de flush de Hibernate.
     */
    public void replaceSteps(List<String> instructions) {
        int nuevos = instructions.size();
        int existentes = this.steps.size();

        for (int i = 0; i < Math.min(nuevos, existentes); i++) {
            this.steps.get(i).reword(instructions.get(i));
        }
        for (int i = existentes - 1; i >= nuevos; i--) {
            this.steps.remove(i);
        }
        for (int i = existentes; i < nuevos; i++) {
            this.steps.add(RecipeStep.of(this, i + 1, instructions.get(i)));
        }
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

    public String getDescription() {
        return description;
    }

    public Integer getServings() {
        return servings;
    }

    public Integer getPrepMinutes() {
        return prepMinutes;
    }

    public User getCreatedBy() {
        return createdBy;
    }

    public List<RecipeIngredient> getIngredients() {
        return ingredients;
    }

    public List<RecipeStep> getSteps() {
        return steps;
    }
}
