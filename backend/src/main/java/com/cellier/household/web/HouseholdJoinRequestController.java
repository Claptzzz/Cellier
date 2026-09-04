package com.cellier.household.web;

import com.cellier.household.JoinRequestService;
import com.cellier.household.domain.JoinRequestStatus;
import com.cellier.household.dto.JoinRequestResponse;
import com.cellier.shared.config.OpenApiConfig;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/households/{householdId}/join-requests")
@Tag(name = "Household join requests", description = """
        La bandeja de solicitudes de un hogar, desde el lado de quien decide.

        Todo lo de aquí es **exclusivo de los administradores**: son las operaciones por las
        que alguien entra en el hogar, y por tanto obtiene acceso a su despensa.
        """)
@SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME)
public class HouseholdJoinRequestController {

    private static final String EXAMPLE_LIST = """
            [
              {
                "id": "5a1e93b7-2c04-4d88-91fe-77b6c0a2d431",
                "userId": "d90f4c21-77ab-4e35-9f62-1c8b03ad5e47",
                "displayName": "Bruno Soto",
                "email": "bruno.soto@gmail.com",
                "avatarUrl": null,
                "status": "PENDING",
                "requestedAt": "2026-09-04T09:15:02Z"
              }
            ]""";

    private static final String EXAMPLE_APPROVED = """
            {
              "id": "5a1e93b7-2c04-4d88-91fe-77b6c0a2d431",
              "userId": "d90f4c21-77ab-4e35-9f62-1c8b03ad5e47",
              "displayName": "Bruno Soto",
              "email": "bruno.soto@gmail.com",
              "avatarUrl": null,
              "status": "APPROVED",
              "requestedAt": "2026-09-04T09:15:02Z",
              "resolvedAt": "2026-09-04T10:02:44Z",
              "resolvedByUserId": "3f1c9a2e-5b7d-4a10-9c88-2f0e6b4d1a73"
            }""";

    private static final String EXAMPLE_REJECTED = """
            {
              "id": "5a1e93b7-2c04-4d88-91fe-77b6c0a2d431",
              "userId": "d90f4c21-77ab-4e35-9f62-1c8b03ad5e47",
              "displayName": "Bruno Soto",
              "email": "bruno.soto@gmail.com",
              "avatarUrl": null,
              "status": "REJECTED",
              "requestedAt": "2026-09-04T09:15:02Z",
              "resolvedAt": "2026-09-04T10:02:44Z",
              "resolvedByUserId": "3f1c9a2e-5b7d-4a10-9c88-2f0e6b4d1a73"
            }""";

    private static final String EXAMPLE_UNAUTHORIZED = """
            {
              "type": "https://cellier.app/problems/unauthorized",
              "title": "No autenticado",
              "status": 401,
              "detail": "Se requiere un access token válido.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/join-requests"
            }""";

    private static final String EXAMPLE_FORBIDDEN = """
            {
              "type": "https://cellier.app/problems/forbidden",
              "title": "Operación no permitida",
              "status": 403,
              "detail": "Esta operación requiere rol de administrador en el hogar.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/join-requests"
            }""";

    private static final String EXAMPLE_HOUSEHOLD_NOT_FOUND = """
            {
              "type": "https://cellier.app/problems/not-found",
              "title": "Recurso no encontrado",
              "status": 404,
              "detail": "No existe ese hogar, o no eres miembro de él.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/join-requests"
            }""";

    private static final String EXAMPLE_REQUEST_NOT_FOUND = """
            {
              "type": "https://cellier.app/problems/not-found",
              "title": "Recurso no encontrado",
              "status": 404,
              "detail": "No existe esa solicitud en este hogar.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/join-requests/5a1e93b7-2c04-4d88-91fe-77b6c0a2d431:approve"
            }""";

    private static final String EXAMPLE_ALREADY_RESOLVED = """
            {
              "type": "https://cellier.app/problems/conflict",
              "title": "Conflicto con el estado actual",
              "status": 409,
              "detail": "Esa solicitud ya está resuelta.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/join-requests/5a1e93b7-2c04-4d88-91fe-77b6c0a2d431:approve"
            }""";

    private static final String HOUSEHOLD_NOT_FOUND_DESCRIPTION =
            "El hogar no existe, o existe pero el usuario autenticado no es miembro. "
                    + "La API no distingue ambos casos a propósito.";

    private static final String REQUEST_NOT_FOUND_DESCRIPTION =
            "El hogar no es accesible para quien llama, o esa solicitud no pertenece a este hogar.";

    private final JoinRequestService joinRequests;

    public HouseholdJoinRequestController(JoinRequestService joinRequests) {
        this.joinRequests = joinRequests;
    }

    @Operation(
            summary = "Listar las solicitudes del hogar",
            description = """
                    Las solicitudes dirigidas a este hogar, con los datos de quien las envía.
                    Solo para administradores.

                    Sin `status` llegan todas, con las pendientes primero por ser las que piden
                    una decisión. Para la bandeja de trabajo habitual, `?status=PENDING`.

                    Cada solicitud incluye el correo del solicitante: aprobar da acceso a la
                    despensa de la casa, y el nombre para mostrar no basta para distinguir a
                    dos homónimos.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Solicitudes del hogar.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            array = @ArraySchema(schema = @Schema(implementation = JoinRequestResponse.class)),
                            examples = @ExampleObject(name = "pendientes", value = EXAMPLE_LIST))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "403", description = "El usuario es miembro del hogar, pero no administrador.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "noEsAdmin", value = EXAMPLE_FORBIDDEN))),
            @ApiResponse(responseCode = "404", description = HOUSEHOLD_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "hogarAjenoOInexistente", value = EXAMPLE_HOUSEHOLD_NOT_FOUND)))
    })
    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public List<JoinRequestResponse> list(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Filtra por estado. Si se omite, llegan todas.",
                    example = "PENDING")
            @RequestParam(required = false) JoinRequestStatus status) {
        return joinRequests.listForHousehold(householdId, status);
    }

    @Operation(
            summary = "Aprobar una solicitud",
            description = """
                    Acepta a la persona y **crea su membresía en la misma operación**, con rol
                    `MEMBER`. Es el único camino por el que alguien entra en un hogar sin
                    haberlo creado.

                    A partir de aquí el hogar deja de responderle `404` y aparece en su
                    `GET /api/v1/households`.

                    Una solicitud ya resuelta responde `409`, incluidas las que otro
                    administrador acabe de resolver.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Solicitud aprobada; la persona ya es miembro.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = JoinRequestResponse.class),
                            examples = @ExampleObject(name = "aprobada", value = EXAMPLE_APPROVED))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "403", description = "El usuario es miembro del hogar, pero no administrador.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "noEsAdmin", value = EXAMPLE_FORBIDDEN))),
            @ApiResponse(responseCode = "404", description = REQUEST_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "solicitudDeOtroHogar", value = EXAMPLE_REQUEST_NOT_FOUND))),
            @ApiResponse(responseCode = "409", description = "La solicitud ya estaba resuelta.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "yaResuelta", value = EXAMPLE_ALREADY_RESOLVED)))
    })
    @PostMapping(path = "/{joinRequestId}:approve", produces = MediaType.APPLICATION_JSON_VALUE)
    public JoinRequestResponse approve(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Identificador de la solicitud.",
                    example = "5a1e93b7-2c04-4d88-91fe-77b6c0a2d431")
            @PathVariable UUID joinRequestId) {
        return joinRequests.approve(householdId, joinRequestId);
    }

    @Operation(
            summary = "Rechazar una solicitud",
            description = """
                    Deniega la entrada. No crea ninguna membresía y **no cierra la puerta para
                    siempre**: la persona puede volver a solicitarlo más adelante, porque el
                    hueco de «una solicitud viva por hogar» solo lo ocupan las pendientes.

                    Rechazar no es lo mismo que cancelar: rechaza un administrador y queda
                    constancia de quién fue; cancelar solo puede hacerlo el propio solicitante.

                    Una solicitud ya resuelta responde `409`.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Solicitud rechazada.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = JoinRequestResponse.class),
                            examples = @ExampleObject(name = "rechazada", value = EXAMPLE_REJECTED))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "403", description = "El usuario es miembro del hogar, pero no administrador.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "noEsAdmin", value = EXAMPLE_FORBIDDEN))),
            @ApiResponse(responseCode = "404", description = REQUEST_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "solicitudDeOtroHogar", value = EXAMPLE_REQUEST_NOT_FOUND))),
            @ApiResponse(responseCode = "409", description = "La solicitud ya estaba resuelta.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "yaResuelta", value = EXAMPLE_ALREADY_RESOLVED)))
    })
    @PostMapping(path = "/{joinRequestId}:reject", produces = MediaType.APPLICATION_JSON_VALUE)
    public JoinRequestResponse reject(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Identificador de la solicitud.",
                    example = "5a1e93b7-2c04-4d88-91fe-77b6c0a2d431")
            @PathVariable UUID joinRequestId) {
        return joinRequests.reject(householdId, joinRequestId);
    }
}
