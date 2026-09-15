package com.cellier.template.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.UUID;

/** Una plantilla en la lista: lo justo para elegir cuál abrir. */
@Schema(name = "TemplateSummaryResponse", description = "Plantilla, vista desde la lista.")
public record TemplateSummaryResponse(

        @Schema(description = "Identificador de la plantilla.",
                example = "3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13")
        UUID id,

        @Schema(description = "Nombre dentro del hogar.", example = "Compra semanal")
        String name,

        @Schema(description = "Cuántos productos la componen.", example = "12")
        long itemCount,

        @Schema(description = """
                Quién la creó, o ausente si esa persona se dio de baja. Es un dato, no una \
                autoridad: cualquier miembro del hogar puede editarla.""",
                example = "Ana Rivas")
        String createdByName,

        @Schema(description = "Cuándo se creó.", example = "2026-08-24T15:00:00Z")
        Instant createdAt,

        @Schema(description = "Cuándo se tocó por última vez.", example = "2026-09-02T11:20:00Z")
        Instant updatedAt
) {
}
