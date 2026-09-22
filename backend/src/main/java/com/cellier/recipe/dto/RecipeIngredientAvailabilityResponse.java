package com.cellier.recipe.dto;

import com.cellier.catalog.domain.ProductUnit;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.util.UUID;

/** Un ingrediente cruzado contra la despensa: cuánto hace falta, cuánto hay, y cuánto falta. */
@Schema(name = "RecipeIngredientAvailabilityResponse",
        description = "Un ingrediente de la receta frente a la despensa.")
public record RecipeIngredientAvailabilityResponse(

        @Schema(description = "Producto del catálogo del hogar.",
                example = "7bfdf8ce-50e4-4144-9ec0-21320ce43d14")
        UUID productId,

        @Schema(description = "Nombre del producto.", example = "Huevos")
        String productName,

        @Schema(description = "Unidad canónica. Las tres cantidades van en ella.", example = "UNIT")
        ProductUnit unit,

        @Schema(description = "Categoría, si la tiene.", example = "Frescos")
        String category,

        @Schema(description = "Cuánto hace falta.", example = "6")
        BigDecimal quantity,

        @Schema(description = """
                Cuánto hay en la despensa ahora. Cero si el producto no está en ella: no \
                tenerlo registrado y tenerlo a cero llevan a la misma respuesta.""",
                example = "4")
        BigDecimal availableQuantity,

        @Schema(description = "Lo que falta. Nunca negativo: tener de más no es tener que devolver.",
                example = "2")
        BigDecimal missingQuantity,

        @Schema(description = """
                Si es opcional, no cuenta para decidir si la receta está lista: puede faltar \
                sin que eso cambie el resultado.""",
                example = "false")
        boolean optional,

        @Schema(description = "Si lo que hay en la despensa cubre lo que hace falta.",
                example = "false")
        boolean sufficient
) {
}
