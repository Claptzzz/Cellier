package com.cellier.recipe.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.UUID;

/** Una receta en la lista: lo justo para pintar el badge sin llamadas extra. */
@Schema(name = "RecipeSummaryResponse", description = "Receta vista desde la lista, con disponibilidad ya calculada.")
public record RecipeSummaryResponse(

        @Schema(description = "Identificador de la receta.",
                example = "3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13")
        UUID id,

        @Schema(description = "Nombre de la receta.", example = "Tarta de manzana")
        String name,

        @Schema(description = "Cuántos ingredientes tiene, opcionales incluidos.", example = "6")
        long ingredientCount,

        @Schema(description = "Cuántos ingredientes no opcionales no llegan a lo que hace falta.",
                example = "1")
        int missingCount,

        @Schema(description = """
                READY si todo ingrediente no opcional cumple lo que hace falta y hay al menos \
                uno; MISSING en cualquier otro caso, incluida una receta sin ingredientes \
                obligatorios todavía.""",
                example = "MISSING", allowableValues = {"READY", "MISSING"})
        RecipeAvailability availability,

        @Schema(description = """
                Quién la creó, o ausente si esa persona se dio de baja. Es un dato, no una \
                autoridad: cualquier miembro del hogar puede editarla.""",
                example = "Ana Rivas")
        String createdByName,

        @Schema(description = "Cuándo se creó.", example = "2026-08-24T15:00:00Z")
        Instant createdAt,

        @Schema(description = "Cuándo se tocó por última vez.", example = "2026-09-02T11:20:00Z")
        Instant updatedAt
) {
}
