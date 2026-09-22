package com.cellier.recipe.dto;

/** Si la receta se puede cocinar ahora mismo con lo que hay en la despensa. */
public enum RecipeAvailability {

    /**
     * Todo ingrediente NO opcional cumple {@code stock >= quantity}, y hay al menos uno.
     * Una receta sin ingredientes obligatorios —cero líneas, o todas opcionales— nunca es
     * READY: no hay nada que comprobar todavía, y eso no es lo mismo que estar lista.
     */
    READY,

    /** Falta algo, o la receta no tiene ningún ingrediente no opcional que comprobar. */
    MISSING
}
