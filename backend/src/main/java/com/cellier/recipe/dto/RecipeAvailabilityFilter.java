package com.cellier.recipe.dto;

/** Cómo filtrar el listado de recetas por disponibilidad. Se resuelve en la base. */
public enum RecipeAvailabilityFilter {

    /** Sin filtrar. */
    ALL,

    /** Sólo las que se pueden cocinar ahora mismo. */
    READY,

    /** Sólo las que no se pueden cocinar ahora mismo. */
    MISSING
}
