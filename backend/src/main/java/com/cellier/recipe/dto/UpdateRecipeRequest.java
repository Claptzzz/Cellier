package com.cellier.recipe.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Reemplazo completo de una receta: nombre, ingredientes y pasos juntos, no una fusión. Lo
 * que no venga en {@code ingredients} o en {@code steps} deja de estar.
 */
@Schema(name = "UpdateRecipeRequest", description = "La receta entera, tal como debe quedar.")
public record UpdateRecipeRequest(

        @Schema(description = "Nombre de la receta.", example = "Tarta de manzana")
        @NotBlank(message = "El nombre es obligatorio")
        @Size(max = 120, message = "El nombre no puede pasar de 120 caracteres")
        String name,

        @Schema(description = "Descripción libre. Opcional.",
                example = "Clásica, con canela y un toque de limón.")
        @Size(max = 2000, message = "La descripción no puede pasar de 2000 caracteres")
        String description,

        @Schema(description = "Para cuántas raciones. Opcional, mayor que cero si se indica.",
                example = "6")
        @Positive(message = "Las raciones tienen que ser mayores que cero")
        Integer servings,

        @Schema(description = "Minutos de preparación. Opcional, mayor que cero si se indica.",
                example = "45")
        @Positive(message = "Los minutos de preparación tienen que ser mayores que cero")
        Integer prepMinutes,

        @Schema(description = "Los ingredientes que tendrá la receta. Vacía la deja sin ingredientes.")
        @Valid
        List<RecipeIngredientRequest> ingredients,

        @Schema(description = "Los pasos que tendrá la receta, en orden. Vacía la deja sin pasos.")
        List<@NotBlank(message = "Un paso no puede estar en blanco")
             @Size(max = 1000, message = "Un paso no puede pasar de 1000 caracteres") String> steps
) {
}
