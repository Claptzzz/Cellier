package com.cellier.recipe.dto;

import com.cellier.catalog.domain.ProductUnit;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Un ingrediente de la receta, tal como se edita: sin cruzar contra la despensa. El cruce
 * vive en {@link RecipeAvailabilityResponse}, detrás de su propio endpoint.
 */
@Schema(name = "RecipeIngredientResponse", description = "Producto y cantidad de un ingrediente.")
public record RecipeIngredientResponse(

        @Schema(description = "Identificador de la línea.",
                example = "2a6d90f3-4c18-4e75-b0a9-83f5c1d70e62")
        UUID id,

        @Schema(description = "Producto del catálogo del hogar.",
                example = "7bfdf8ce-50e4-4144-9ec0-21320ce43d14")
        UUID productId,

        @Schema(description = "Nombre del producto.", example = "Huevos")
        String productName,

        @Schema(description = "Unidad canónica del producto. La cantidad va en ella.",
                example = "UNIT")
        ProductUnit unit,

        @Schema(description = "Categoría del producto, si la tiene.", example = "Frescos")
        String category,

        @Schema(description = "Cuánto hace falta.", example = "6")
        BigDecimal quantity,

        @Schema(description = """
                Si es opcional, no cuenta para decidir si la receta está lista.""",
                example = "false")
        boolean optional
) {
}
