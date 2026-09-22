package com.cellier.recipe.domain;

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
 * Un paso de una receta: su posición en la secuencia y el texto de la instrucción.
 *
 * <p>No lleva {@code household_id} propio, al revés que {@code RecipeIngredient}: sólo
 * referencia {@code recipes}, una única tabla de hogar, así que no hay una segunda clave
 * foránea con la que un {@code household_id} duplicado pudiera discrepar. El hogar se hereda
 * de la receta al leerla, no hace falta repetirlo para atar nada.
 */
@Entity
@Table(name = "recipe_steps")
public class RecipeStep {

    @Id
    @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipe_id", nullable = false, updatable = false)
    private Recipe recipe;

    @Column(name = "position", nullable = false)
    private int position;

    @Column(name = "instruction", nullable = false)
    private String instruction;

    protected RecipeStep() {
        // Requerido por JPA.
    }

    private RecipeStep(Recipe recipe, int position, String instruction) {
        this.recipe = recipe;
        this.position = position;
        this.instruction = instruction;
    }

    public static RecipeStep of(Recipe recipe, int position, String instruction) {
        return new RecipeStep(recipe, position, instruction);
    }

    /** Cambia el texto de la instrucción. La posición la gobierna {@code Recipe.replaceSteps}. */
    public void reword(String instruction) {
        this.instruction = instruction;
    }

    public UUID getId() {
        return id;
    }

    public Recipe getRecipe() {
        return recipe;
    }

    public int getPosition() {
        return position;
    }

    public String getInstruction() {
        return instruction;
    }
}
