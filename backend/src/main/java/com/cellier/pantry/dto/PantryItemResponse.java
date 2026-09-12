package com.cellier.pantry.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.cellier.pantry.domain.StorageLocation;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Schema(name = "PantryItem", description = "Lo que hay de un producto en la despensa del hogar.")
public record PantryItemResponse(

        @Schema(description = "Identificador del artículo.", example = "7a1c4e93-6d05-4b28-91f7-0c3a8d5e2b46")
        UUID id,

        PantryProductResponse product,

        @Schema(description = "Cuánto hay, en la unidad del producto.", example = "690.000")
        BigDecimal quantity,

        @Schema(description = """
                Vencimiento del lote más próximo, o null. Es una sola fecha por producto: no
                se modelan lotes separados (ADR 011).""",
                example = "2026-10-04")
        LocalDate expiresAt,

        @Schema(description = """
                Cantidad que se considera «tener suficiente». La banda de nivel la usa como
                denominador: sin ella sólo hay una cifra absoluta, no una proporción.

                **Viaja explícitamente como `null` cuando no hay objetivo**, a diferencia del
                resto de campos nulos de la API, que se omiten. Es la diferencia entre «no hay
                objetivo» y «el objetivo es cero»: con la segunda lectura la banda dibujaría
                una proporción del cero, que es siempre vacío.""",
                example = "1000.000")
        @JsonInclude(JsonInclude.Include.ALWAYS)
        BigDecimal parLevel,

        @Schema(description = "Dónde se guarda, o null.", example = "PANTRY",
                allowableValues = {"PANTRY", "FRIDGE", "FREEZER", "OTHER"})
        StorageLocation storageLocation,

        @Schema(description = """
                Versión del artículo. Cambia con cada modificación; sirve al cliente para
                saber si lo que tiene en pantalla sigue siendo lo que hay.""",
                example = "3")
        long version
) {
}
