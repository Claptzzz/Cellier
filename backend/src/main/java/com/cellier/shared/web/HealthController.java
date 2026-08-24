package com.cellier.shared.web;

import com.cellier.shared.web.dto.HealthResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/health")
@Tag(name = "Health", description = "Sondeo público de disponibilidad del servicio.")
public class HealthController {

    @Operation(
            summary = "Comprobar que la API responde",
            description = """
                    Devuelve el estado del servicio. Es un endpoint público: no requiere token.
                    Sirve para verificar que el backend levantó y que la SPA alcanza la API.
                    """,
            security = {}
    )
    @ApiResponse(
            responseCode = "200",
            description = "El servicio está disponible.",
            content = @Content(
                    mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = HealthResponse.class),
                    examples = @ExampleObject(
                            name = "up",
                            summary = "Servicio disponible",
                            value = """
                                    {"status":"UP","service":"cellier"}"""
                    )
            )
    )
    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public HealthResponse health() {
        return new HealthResponse("UP", "cellier");
    }
}
