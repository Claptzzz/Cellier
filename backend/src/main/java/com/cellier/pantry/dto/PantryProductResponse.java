package com.cellier.pantry.dto;

import com.cellier.catalog.domain.ProductUnit;
import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

/** El producto, embebido en el artículo de despensa para no obligar a una segunda llamada. */
@Schema(name = "PantryProduct", description = "Producto al que corresponde el artículo.")
public record PantryProductResponse(

        @Schema(description = "Identificador del producto.", example = "c15f8d32-7b40-4e29-8c61-a4d09e7b2f53")
        UUID id,

        @Schema(description = "Nombre del producto.", example = "Salsa de tomate")
        String name,

        @Schema(description = "Unidad en la que se expresa la cantidad. No se convierte.", example = "ML")
        ProductUnit unit,

        @Schema(description = "Categoría del producto, o null.", example = "Despensa")
        String category
) {
}
