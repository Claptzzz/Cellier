package com.cellier.recipe.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/** Un paso de la receta, en su posición. */
@Schema(name = "RecipeStepResponse", description = "Un paso de la preparación.")
public record RecipeStepResponse(

        @Schema(description = "Posición del paso, empezando en 1.", example = "1")
        int position,

        @Schema(description = "El texto de la instrucción.",
                example = "Pelar y laminar las manzanas.")
        String instruction
) {
}
