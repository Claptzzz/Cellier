package com.cellier.recipe.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

/** Alta de una receta entera: nombre, ingredientes y pasos juntos. */
@Schema(name = "CreateRecipeRequest", description = "Nueva receta del hogar, con ingredientes y pasos.")
public record CreateRecipeRequest(

        @Schema(description = "Nombre de la receta. No es único: puede haber varias variantes.",
                example = "Tarta de manzana")
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

        @Schema(description = "Los ingredientes que hacen falta.")
        @Valid
        List<RecipeIngredientRequest> ingredients,

        @Schema(description = "Los pasos, en orden. Se numeran por su posición en la lista.")
        List<@NotBlank(message = "Un paso no puede estar en blanco")
             @Size(max = 1000, message = "Un paso no puede pasar de 1000 caracteres") String> steps
) {
}
