package com.cellier.template.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * La lista entera que se quiere tener.
 *
 * <p>Es un reemplazo, no una fusión: lo que no venga aquí deja de estar en la plantilla. Se
 * edita como un bloque, así que no hace falta inventar un lenguaje de altas y bajas.
 */
@Schema(name = "ReplaceItemsRequest", description = "Lista completa de productos de la plantilla.")
public record ReplaceItemsRequest(

        @Schema(description = "Las líneas que tendrá la plantilla. Vacía la deja sin productos.")
        @NotNull(message = "Falta la lista de productos")
        @Valid
        List<TemplateItemRequest> items
) {
}
