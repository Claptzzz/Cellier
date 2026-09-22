package com.cellier.recipe.dto;

import com.cellier.catalog.domain.ProductUnit;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Una fila cruda del cruce entre los ingredientes de UNA receta y la despensa. Trae lo que la
 * base sabe; si cubre o no lo que hace falta se calcula después, en {@code RecipeService}.
 */
public record RecipeIngredientRow(
        UUID ingredientId,
        UUID productId,
        String productName,
        ProductUnit unit,
        String category,
        BigDecimal quantity,
        boolean optional,
        BigDecimal availableQuantity
) {
}
