package com.cellier.pantry.dto;

import com.cellier.catalog.domain.ProductUnit;
import com.cellier.pantry.domain.StorageLocation;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Alta de un artículo en la despensa.
 *
 * <p>El producto se indica de una de dos formas: con {@code productId}, si ya está en el
 * catálogo, o con {@code productName} y {@code unit}, y entonces se crea si hace falta. Las
 * dos formas son excluyentes.
 */
@Schema(name = "CreatePantryItemRequest",
        description = "Alta en la despensa. Indica productId, o bien productName y unit.")
public record CreatePantryItemRequest(

        @Schema(description = "Producto que ya está en el catálogo del hogar.",
                example = "c15f8d32-7b40-4e29-8c61-a4d09e7b2f53")
        UUID productId,

        @Schema(description = """
                Nombre del producto, si no se envía `productId`. Si ya existe uno con ese
                nombre en el hogar —sin distinguir mayúsculas— se reutiliza; si no, se crea.""",
                example = "Salsa de tomate")
        @Size(max = 120, message = "El nombre no puede pasar de 120 caracteres")
        String productName,

        @Schema(description = """
                Unidad del producto nuevo. Obligatoria junto a `productName`. Si el producto
                ya existía con otra unidad, la petición se rechaza con 409 en vez de
                reinterpretar la cantidad.""",
                example = "ML", allowableValues = {"UNIT", "G", "KG", "ML", "L", "PACK"})
        ProductUnit unit,

        @Schema(description = "Cuánto hay, en la unidad del producto.", example = "690")
        @NotNull(message = "La cantidad es obligatoria")
        @DecimalMin(value = "0", message = "La cantidad no puede ser negativa")
        BigDecimal quantity,

        @Schema(description = "Vencimiento del lote más próximo. Opcional.", example = "2026-10-04")
        LocalDate expiresAt,

        @Schema(description = "Cantidad que se considera suficiente. Opcional.", example = "1000")
        @DecimalMin(value = "0", inclusive = false, message = "El nivel objetivo tiene que ser mayor que cero")
        BigDecimal parLevel,

        @Schema(description = "Dónde se guarda. Opcional.", example = "PANTRY",
                allowableValues = {"PANTRY", "FRIDGE", "FREEZER", "OTHER"})
        StorageLocation storageLocation
) {
}
