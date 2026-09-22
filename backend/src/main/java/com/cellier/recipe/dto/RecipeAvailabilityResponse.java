package com.cellier.recipe.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Si una receta se puede cocinar ahora mismo, y por qué.
 *
 * <p>Se calcula al vuelo y no se guarda, igual que el reporte de compras de las plantillas:
 * es cierta en el instante que declara {@code generatedAt} y no pretende serlo después.
 */
@Schema(name = "RecipeAvailabilityResponse", description = "La receta comparada con la despensa.")
public record RecipeAvailabilityResponse(

        @Schema(description = "Receta comparada.", example = "3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13")
        UUID recipeId,

        @Schema(description = "Nombre de la receta.", example = "Tarta de manzana")
        String recipeName,

        @Schema(description = "Instante del cálculo. La respuesta vale para ese momento.",
                example = "2026-08-24T15:00:00Z")
        Instant generatedAt,

        @Schema(description = """
                READY si todo ingrediente no opcional cumple lo que hace falta y hay al menos \
                uno; MISSING en cualquier otro caso, incluida una receta sin ingredientes \
                obligatorios todavía.""",
                example = "MISSING", allowableValues = {"READY", "MISSING"})
        RecipeAvailability availability,

        @Schema(description = "Cuántos ingredientes no opcionales no llegan a lo que hace falta.",
                example = "1")
        int missingCount,

        @Schema(description = "Cada ingrediente, con lo que hace falta, lo que hay, y lo que falta.")
        List<RecipeIngredientAvailabilityResponse> items
) {
}
