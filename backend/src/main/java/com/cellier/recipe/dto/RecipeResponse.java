package com.cellier.recipe.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Una receta entera, tal como se edita: sus ingredientes y pasos, sin cruzar contra la
 * despensa. Ese cruce vive en {@link RecipeAvailabilityResponse}, detrás de
 * {@code GET /recipes/{id}/availability}: el detalle no es el reporte, igual que en las
 * plantillas.
 */
@Schema(name = "RecipeResponse", description = "Receta completa, con ingredientes y pasos.")
public record RecipeResponse(

        @Schema(description = "Identificador de la receta.",
                example = "3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13")
        UUID id,

        @Schema(description = "Nombre de la receta.", example = "Tarta de manzana")
        String name,

        @Schema(description = "Descripción libre, si la tiene.",
                example = "Clásica, con canela y un toque de limón.")
        String description,

        @Schema(description = "Para cuántas raciones, si se indicó.", example = "6")
        Integer servings,

        @Schema(description = "Minutos de preparación, si se indicaron.", example = "45")
        Integer prepMinutes,

        @Schema(description = """
                Quién la creó, o ausente si esa persona se dio de baja. Es un dato, no una \
                autoridad: cualquier miembro del hogar puede editarla.""",
                example = "Ana Rivas")
        String createdByName,

        @Schema(description = "Cuándo se creó.", example = "2026-08-24T15:00:00Z")
        Instant createdAt,

        @Schema(description = "Cuándo se tocó por última vez.", example = "2026-09-02T11:20:00Z")
        Instant updatedAt,

        @Schema(description = "Los ingredientes que hacen falta.")
        List<RecipeIngredientResponse> ingredients,

        @Schema(description = "Los pasos, en orden.")
        List<RecipeStepResponse> steps
) {
}
