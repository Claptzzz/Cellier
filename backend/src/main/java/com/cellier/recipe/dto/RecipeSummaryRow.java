package com.cellier.recipe.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * Una fila cruda del listado de recetas, con los tres recuentos que hacen falta para decidir
 * la disponibilidad. Trae lo que la base sabe, no lo que se deduce de ello: la disponibilidad
 * se calcula una sola vez, en {@code RecipeService}.
 */
public record RecipeSummaryRow(
        UUID id,
        String name,
        long ingredientCount,
        long requiredCount,
        long missingCount,
        String createdByName,
        Instant createdAt,
        Instant updatedAt
) {
}
