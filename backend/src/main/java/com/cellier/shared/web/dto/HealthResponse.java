package com.cellier.shared.web.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Respuesta del sondeo público de disponibilidad.
 *
 * @param status  estado del servicio, siempre {@code UP} si la petición se atiende
 * @param service identificador del servicio que responde
 */
@Schema(name = "HealthResponse", description = "Estado de disponibilidad del servicio Cellier.")
public record HealthResponse(

        @Schema(description = "Estado del servicio.", example = "UP")
        String status,

        @Schema(description = "Identificador del servicio que responde.", example = "cellier")
        String service
) {
}
