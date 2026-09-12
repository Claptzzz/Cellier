package com.cellier.catalog.dto;

import com.cellier.catalog.domain.ProductUnit;
import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

@Schema(name = "Product", description = "Producto del catálogo de un hogar.")
public record ProductResponse(

        @Schema(description = "Identificador del producto.", example = "4d9a1f60-2c83-4b17-9e5a-71c0d6f2a3b8")
        UUID id,

        @Schema(description = "Nombre tal como lo escribió quien lo creó.", example = "Salsa de tomate")
        String name,

        @Schema(description = """
                Unidad canónica. Todas las cantidades de este producto se expresan en ella, y
                **no se convierte** a ninguna otra.""",
                example = "ML", allowableValues = {"UNIT", "G", "KG", "ML", "L", "PACK"})
        ProductUnit unit,

        @Schema(description = "Categoría libre para agrupar en la despensa, o null.", example = "Despensa")
        String category
) {
}
