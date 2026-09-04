package com.cellier.household.web;

import com.cellier.household.JoinRequestService;
import com.cellier.household.dto.CreateJoinRequestRequest;
import com.cellier.household.dto.MyJoinRequestResponse;
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
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/join-requests")
@Tag(name = "Join requests", description = """
        Pedir entrar en un hogar, desde el lado de quien lo pide.

        **Conocer el código de ingreso no da acceso.** Enviarlo abre una solicitud pendiente
        que un administrador del hogar debe aprobar; hasta entonces el hogar sigue siendo
        invisible para el solicitante, y consultarlo responde `404` como cualquier hogar ajeno.
        """)
@SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME)
public class JoinRequestController {

    private static final String EXAMPLE_MINE_CREATED = """
            {
              "id": "5a1e93b7-2c04-4d88-91fe-77b6c0a2d431",
              "householdId": "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98",
              "householdName": "Casa Rivas",
              "status": "PENDING",
              "requestedAt": "2026-09-04T09:15:02Z"
            }""";

    private static final String EXAMPLE_MINE_LIST = """
            [
              {
                "id": "5a1e93b7-2c04-4d88-91fe-77b6c0a2d431",
                "householdId": "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98",
                "householdName": "Casa Rivas",
                "status": "PENDING",
                "requestedAt": "2026-09-04T09:15:02Z"
              },
              {
                "id": "1b7c40de-9e12-4a63-8f05-33c1a7e6b209",
                "householdId": "b41d0f77-6c58-4e92-8a03-5fd91c2e7a64",
                "householdName": "Depa Ñuñoa",
                "status": "REJECTED",
                "requestedAt": "2026-08-28T20:41:17Z",
                "resolvedAt": "2026-08-29T08:03:55Z"
              }
            ]""";

    private static final String EXAMPLE_UNAUTHORIZED = """
            {
              "type": "https://cellier.app/problems/unauthorized",
              "title": "No autenticado",
              "status": 401,
              "detail": "Se requiere un access token válido.",
              "instance": "/api/v1/join-requests"
            }""";

    private static final String EXAMPLE_CODE_NOT_FOUND = """
            {
              "type": "https://cellier.app/problems/not-found",
              "title": "Recurso no encontrado",
              "status": 404,
              "detail": "No hay ningún hogar con ese código de ingreso.",
              "instance": "/api/v1/join-requests"
            }""";

    private static final String EXAMPLE_ALREADY_MEMBER = """
            {
              "type": "https://cellier.app/problems/conflict",
              "title": "Conflicto con el estado actual",
              "status": 409,
              "detail": "Ya perteneces a ese hogar.",
              "instance": "/api/v1/join-requests"
            }""";

    private static final String EXAMPLE_BAD_CODE = """
            {
              "type": "https://cellier.app/problems/bad-request",
              "title": "Datos inválidos",
              "status": 400,
              "detail": "Uno o más campos del cuerpo de la petición no son válidos.",
              "instance": "/api/v1/join-requests",
              "errors": { "joinCode": "El código tiene 8 caracteres alfanuméricos y no incluye 0, O, 1, I ni L" }
            }""";

    private static final String EXAMPLE_REQUEST_NOT_FOUND = """
            {
              "type": "https://cellier.app/problems/not-found",
              "title": "Recurso no encontrado",
              "status": 404,
              "detail": "No existe esa solicitud.",
              "instance": "/api/v1/join-requests/5a1e93b7-2c04-4d88-91fe-77b6c0a2d431"
            }""";

    private static final String EXAMPLE_ALREADY_RESOLVED = """
            {
              "type": "https://cellier.app/problems/conflict",
              "title": "Conflicto con el estado actual",
              "status": 409,
              "detail": "Esa solicitud ya está resuelta.",
              "instance": "/api/v1/join-requests/5a1e93b7-2c04-4d88-91fe-77b6c0a2d431"
            }""";

    private final JoinRequestService joinRequests;

    public JoinRequestController(JoinRequestService joinRequests) {
        this.joinRequests = joinRequests;
    }

    @Operation(
            summary = "Pedir entrar en un hogar",
            description = """
                    Envía el código de un hogar y deja una solicitud **pendiente**. No concede
                    acceso: hasta que un administrador la apruebe, el hogar no aparece en
                    `GET /api/v1/households` y consultarlo devuelve `404`.

                    El código no distingue mayúsculas de minúsculas y se ignoran los espacios
                    sobrantes, porque suele teclearse a mano.

                    Responde `409` si ya perteneces al hogar o si ya tienes una solicitud
                    pendiente allí: no se acumulan solicitudes para el mismo sitio.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Solicitud registrada, a la espera de un administrador.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = MyJoinRequestResponse.class),
                            examples = @ExampleObject(name = "solicitudCreada", value = EXAMPLE_MINE_CREATED))),
            @ApiResponse(responseCode = "400", description = "El código falta o no tiene la forma esperada.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "codigoMalFormado", value = EXAMPLE_BAD_CODE))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = "Ningún hogar tiene ese código, o dejó de tenerlo al regenerarse.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "codigoDesconocido", value = EXAMPLE_CODE_NOT_FOUND))),
            @ApiResponse(responseCode = "409", description = "Ya eres miembro de ese hogar, o ya tienes allí una solicitud pendiente.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "yaEresMiembro", value = EXAMPLE_ALREADY_MEMBER)))
    })
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<MyJoinRequestResponse> create(@Valid @RequestBody CreateJoinRequestRequest request) {
        MyJoinRequestResponse created = joinRequests.create(request);
        return ResponseEntity.created(java.net.URI.create("/api/v1/join-requests/" + created.id())).body(created);
    }

    @Operation(
            summary = "Ver mis solicitudes",
            description = """
                    Todas las solicitudes que ha enviado el usuario autenticado, en cualquier
                    estado, de la más reciente a la más antigua.

                    Cada una lleva el nombre del hogar —quien la envió tecleó un código, no un
                    nombre— pero ningún otro dato de él: ni su código de ingreso, ni quiénes lo
                    habitan. Eso llega al ser admitido.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Solicitudes propias. Lista vacía si no ha enviado ninguna.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            array = @ArraySchema(schema = @Schema(implementation = MyJoinRequestResponse.class)),
                            examples = @ExampleObject(name = "misSolicitudes", value = EXAMPLE_MINE_LIST))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED)))
    })
    @GetMapping(path = "/mine", produces = MediaType.APPLICATION_JSON_VALUE)
    public List<MyJoinRequestResponse> listMine() {
        return joinRequests.listMine();
    }

    @Operation(
            summary = "Cancelar una solicitud propia",
            description = """
                    Retira una solicitud que sigue pendiente. **Solo puede cancelarla quien la
                    envió**: un administrador no cancela solicitudes ajenas, las *rechaza*, que
                    es una acción distinta y con otro significado en el historial.

                    Cancelar libera el hueco y permite volver a solicitar en ese mismo hogar.
                    Es la salida de quien tecleó mal un código: sin ella quedaría bloqueado
                    esperando a que alguien rechazase, en una casa ajena, una solicitud que
                    probablemente nadie llegue a mirar.

                    Una solicitud ya resuelta —aprobada, rechazada o cancelada— responde `409`.
                    La solicitud de otra persona responde `404`, no `403`, igual que un hogar
                    ajeno: quien pregunta no debe poder averiguar que existe.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Solicitud cancelada.", content = @Content),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = "La solicitud no existe, o la envió otra persona.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "solicitudAjenaOInexistente", value = EXAMPLE_REQUEST_NOT_FOUND))),
            @ApiResponse(responseCode = "409", description = "La solicitud ya estaba resuelta.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "yaResuelta", value = EXAMPLE_ALREADY_RESOLVED)))
    })
    @DeleteMapping(path = "/{joinRequestId}")
    public ResponseEntity<Void> cancel(
            @Parameter(description = "Identificador de la solicitud propia que se retira.",
                    example = "5a1e93b7-2c04-4d88-91fe-77b6c0a2d431")
            @PathVariable UUID joinRequestId) {
        joinRequests.cancel(joinRequestId);
        return ResponseEntity.noContent().build();
    }
}
