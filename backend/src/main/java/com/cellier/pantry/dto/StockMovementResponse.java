package com.cellier.pantry.dto;

import com.cellier.pantry.domain.MovementType;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Un movimiento del historial.
 *
 * <p>El autor va aplanado en dos campos y ambos pueden ser nulos: un movimiento sobrevive a
 * quien lo hizo, porque el historial no se reescribe cuando alguien deja el hogar.
 */
@Schema(name = "StockMovement", description = "Un cambio de cantidad, con quién lo hizo y cuándo.")
public record StockMovementResponse(

        @Schema(description = "Identificador del movimiento.", example = "e2b1f704-9c38-4d56-a7e0-84f1c6b03d29")
        UUID id,

        @Schema(description = """
                Qué clase de cambio fue. Una compra suma, un consumo resta, y un ajuste es una
                corrección a mano.""",
                example = "CONSUMPTION", allowableValues = {"PURCHASE", "CONSUMPTION", "ADJUSTMENT"})
        MovementType type,

        @Schema(description = """
                Cuánto cambió, con signo, en la unidad del producto. La suma de los deltas de
                un artículo es su cantidad actual.""",
                example = "-240.000")
        BigDecimal delta,

        @Schema(description = "Cuándo se registró.", example = "2026-09-12T14:05:33Z")
        Instant performedAt,

        @Schema(description = "Quién lo hizo, o null si esa cuenta ya no está.",
                example = "3f1c9a2e-5b7d-4a10-9c88-2f0e6b4d1a73")
        UUID performedByUserId,

        @Schema(description = "Nombre de quien lo hizo, o null.", example = "Ana Rivas")
        String performedByName
) {
}
