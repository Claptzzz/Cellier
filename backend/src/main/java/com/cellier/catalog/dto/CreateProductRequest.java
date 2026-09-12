package com.cellier.catalog.dto;

import com.cellier.catalog.domain.ProductUnit;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Schema(name = "CreateProductRequest", description = "Alta de un producto en el catálogo del hogar.")
public record CreateProductRequest(

        @Schema(description = "Nombre del producto.", example = "Huevos")
        @NotBlank(message = "El nombre del producto es obligatorio")
        @Size(max = 120, message = "El nombre no puede pasar de 120 caracteres")
        String name,

        @Schema(description = """
                Unidad en la que se medirá siempre. No se puede cambiar después: hacerlo
                reinterpretaría las cantidades ya registradas.""",
                example = "UNIT", allowableValues = {"UNIT", "G", "KG", "ML", "L", "PACK"})
        @NotNull(message = "La unidad es obligatoria")
        ProductUnit unit,

        @Schema(description = "Categoría para agruparlo en la despensa. Opcional.", example = "Nevera")
        @Size(max = 60, message = "La categoría no puede pasar de 60 caracteres")
        String category
) {
}
