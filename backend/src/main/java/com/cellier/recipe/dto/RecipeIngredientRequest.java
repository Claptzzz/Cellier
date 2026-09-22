package com.cellier.recipe.dto;

import com.cellier.catalog.domain.ProductUnit;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Un ingrediente de la receta. El producto se indica de una de dos formas: con
 * {@code productId}, si ya está en el catálogo, o con {@code productName} y {@code unit}, y
 * entonces se crea si hace falta. Las dos formas son excluyentes, igual que en la despensa.
 */
@Schema(name = "RecipeIngredientRequest",
        description = "Producto, cantidad y si es opcional. Indica productId, o bien productName y unit.")
public record RecipeIngredientRequest(

        @Schema(description = "Producto que ya está en el catálogo del hogar.",
                example = "7bfdf8ce-50e4-4144-9ec0-21320ce43d14")
        UUID productId,

        @Schema(description = """
                Nombre del producto, si no se envía `productId`. Si ya existe uno con ese
                nombre en el hogar —sin distinguir mayúsculas— se reutiliza; si no, se crea.""",
                example = "Huevos")
        @Size(max = 120, message = "El nombre no puede pasar de 120 caracteres")
        String productName,

        @Schema(description = """
                Unidad del producto nuevo. Obligatoria junto a `productName`. Si el producto
                ya existía con otra unidad, la petición se rechaza con 409 en vez de
                reinterpretar la cantidad.""",
                example = "UNIT", allowableValues = {"UNIT", "G", "KG", "ML", "L", "PACK"})
        ProductUnit unit,

        @Schema(description = """
                Cuánto hace falta, en la unidad del producto. Mayor que cero: querer «cero» de \
                un ingrediente no es quererlo, es no tener la línea.""",
                example = "6")
        @NotNull(message = "Falta la cantidad")
        @DecimalMin(value = "0", inclusive = false, message = "La cantidad tiene que ser mayor que cero")
        BigDecimal quantity,

        @Schema(description = """
                Si es opcional, no cuenta para decidir si la receta está lista: «sal al gusto» \
                no puede dejar toda la receta en falta porque el bote esté vacío.""",
                example = "false")
        boolean optional
) {
}
