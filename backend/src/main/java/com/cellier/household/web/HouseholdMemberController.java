package com.cellier.household.web;

import com.cellier.household.HouseholdMembershipService;
import com.cellier.household.dto.HouseholdMemberResponse;
import com.cellier.household.dto.UpdateMemberRoleRequest;
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
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/households/{householdId}/members")
@Tag(name = "Household members", description = """
        Quién pertenece a un hogar y con qué rol.

        Sobre todas estas operaciones rige una invariante: **el hogar conserva siempre al menos
        un administrador**. No se puede quitarle el rol al último, ni expulsarlo, ni dejar que
        se salga; cualquiera de las tres responde `409` explicando qué hacer antes.
        """)
@SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME)
public class HouseholdMemberController {

    private static final String EXAMPLE_MEMBER_LIST = """
            [
              {
                "userId": "3f1c9a2e-5b7d-4a10-9c88-2f0e6b4d1a73",
                "displayName": "Ana Rivas",
                "email": "ana.rivas@gmail.com",
                "avatarUrl": "https://lh3.googleusercontent.com/a/ACg8ocK",
                "role": "ADMIN",
                "joinedAt": "2026-09-03T18:42:11Z"
              },
              {
                "userId": "d90f4c21-77ab-4e35-9f62-1c8b03ad5e47",
                "displayName": "Bruno Soto",
                "email": "bruno.soto@gmail.com",
                "avatarUrl": null,
                "role": "MEMBER",
                "joinedAt": "2026-09-04T09:15:02Z"
              }
            ]""";

    private static final String EXAMPLE_MEMBER_PROMOTED = """
            {
              "userId": "d90f4c21-77ab-4e35-9f62-1c8b03ad5e47",
              "displayName": "Bruno Soto",
              "email": "bruno.soto@gmail.com",
              "avatarUrl": null,
              "role": "ADMIN",
              "joinedAt": "2026-09-04T09:15:02Z"
            }""";

    private static final String EXAMPLE_UNAUTHORIZED = """
            {
              "type": "https://cellier.app/problems/unauthorized",
              "title": "No autenticado",
              "status": 401,
              "detail": "Se requiere un access token válido.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/members"
            }""";

    private static final String EXAMPLE_HOUSEHOLD_NOT_FOUND = """
            {
              "type": "https://cellier.app/problems/not-found",
              "title": "Recurso no encontrado",
              "status": 404,
              "detail": "No existe ese hogar, o no eres miembro de él.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/members"
            }""";

    private static final String EXAMPLE_MEMBER_NOT_FOUND = """
            {
              "type": "https://cellier.app/problems/not-found",
              "title": "Recurso no encontrado",
              "status": 404,
              "detail": "Esa persona no pertenece a este hogar.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/members/d90f4c21-77ab-4e35-9f62-1c8b03ad5e47"
            }""";

    private static final String EXAMPLE_FORBIDDEN = """
            {
              "type": "https://cellier.app/problems/forbidden",
              "title": "Operación no permitida",
              "status": 403,
              "detail": "Esta operación requiere rol de administrador en el hogar.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/members/d90f4c21-77ab-4e35-9f62-1c8b03ad5e47"
            }""";

    private static final String EXAMPLE_LAST_ADMIN_DEMOTE = """
            {
              "type": "https://cellier.app/problems/conflict",
              "title": "Conflicto con el estado actual",
              "status": 409,
              "detail": "El hogar debe conservar al menos un administrador. Promueve a otro miembro antes de quitarle el rol a este.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/members/3f1c9a2e-5b7d-4a10-9c88-2f0e6b4d1a73"
            }""";

    private static final String EXAMPLE_LAST_ADMIN_LEAVE = """
            {
              "type": "https://cellier.app/problems/conflict",
              "title": "Conflicto con el estado actual",
              "status": 409,
              "detail": "El hogar debe conservar al menos un administrador. Promueve a otro miembro antes de salir, o elimina el hogar.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/members/3f1c9a2e-5b7d-4a10-9c88-2f0e6b4d1a73"
            }""";

    private static final String EXAMPLE_VALIDATION = """
            {
              "type": "https://cellier.app/problems/bad-request",
              "title": "Datos inválidos",
              "status": 400,
              "detail": "Uno o más campos del cuerpo de la petición no son válidos.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/members/d90f4c21-77ab-4e35-9f62-1c8b03ad5e47",
              "errors": { "role": "El rol es obligatorio" }
            }""";

    private static final String HOUSEHOLD_NOT_FOUND_DESCRIPTION =
            "El hogar no existe, o existe pero el usuario autenticado no es miembro. "
                    + "La API no distingue ambos casos a propósito.";

    private static final String TARGET_NOT_FOUND_DESCRIPTION =
            "El hogar no es accesible para quien llama, o la persona indicada no pertenece a él. "
                    + "El `detail` distingue ambos casos, porque quien llama ya ha demostrado pertenecer al hogar.";

    private final HouseholdMembershipService membership;

    public HouseholdMemberController(HouseholdMembershipService membership) {
        this.membership = membership;
    }

    @Operation(
            summary = "Listar los miembros del hogar",
            description = """
                    Las personas del hogar con su rol y su fecha de ingreso. Lo puede consultar
                    cualquier miembro, sea `ADMIN` o `MEMBER`.

                    Llegan primero los administradores y, dentro de cada grupo, por antigüedad.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Miembros del hogar.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            array = @ArraySchema(schema = @Schema(implementation = HouseholdMemberResponse.class)),
                            examples = @ExampleObject(name = "miembros", value = EXAMPLE_MEMBER_LIST))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = HOUSEHOLD_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "hogarAjenoOInexistente", value = EXAMPLE_HOUSEHOLD_NOT_FOUND)))
    })
    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public List<HouseholdMemberResponse> list(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId) {
        return membership.list(householdId);
    }

    @Operation(
            summary = "Cambiar el rol de un miembro",
            description = """
                    Promueve a `ADMIN` o devuelve a `MEMBER`. Solo un administrador puede
                    hacerlo, y puede hacerlo consigo mismo mientras quede otro.

                    **Quitarle el rol al último administrador responde `409`**: el hogar
                    quedaría sin nadie que pudiera administrarlo. Promueve antes a otra persona.

                    Es idempotente: asignar el rol que ya se tiene devuelve `200` sin cambiar nada.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Rol actualizado.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = HouseholdMemberResponse.class),
                            examples = @ExampleObject(name = "promovido", value = EXAMPLE_MEMBER_PROMOTED))),
            @ApiResponse(responseCode = "400", description = "Falta el rol, o no es `ADMIN` ni `MEMBER`.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "rolAusente", value = EXAMPLE_VALIDATION))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "403", description = "El usuario es miembro del hogar, pero no administrador.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "noEsAdmin", value = EXAMPLE_FORBIDDEN))),
            @ApiResponse(responseCode = "404", description = TARGET_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "personaAjenaAlHogar", value = EXAMPLE_MEMBER_NOT_FOUND))),
            @ApiResponse(responseCode = "409", description = "Dejaría al hogar sin ningún administrador.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "ultimoAdministrador", value = EXAMPLE_LAST_ADMIN_DEMOTE)))
    })
    @PatchMapping(path = "/{userId}",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public HouseholdMemberResponse changeRole(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Identificador del usuario cuyo rol cambia.",
                    example = "d90f4c21-77ab-4e35-9f62-1c8b03ad5e47")
            @PathVariable UUID userId,
            @Valid @RequestBody UpdateMemberRoleRequest request) {
        return membership.changeRole(householdId, userId, request);
    }

    @Operation(
            summary = "Sacar a alguien del hogar",
            description = """
                    Sirve para dos cosas según a quién apunte `userId`:

                    - **Expulsar a otra persona**: requiere ser administrador. Un miembro sin
                      rol recibe `403`, no `404`: ya sabía que el hogar existe.
                    - **Salirse uno mismo**: basta con pertenecer al hogar, sea cual sea el rol.

                    **En ambos casos, si esa persona es el último administrador se responde
                    `409`**, con un mensaje distinto según se trate de una expulsión o de una
                    salida voluntaria. La membresía se borra; el resto del contenido del hogar
                    no se toca.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "La persona ya no pertenece al hogar.", content = @Content),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "403", description = "Intenta expulsar a otra persona sin ser administrador.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "noEsAdmin", value = EXAMPLE_FORBIDDEN))),
            @ApiResponse(responseCode = "404", description = TARGET_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "personaAjenaAlHogar", value = EXAMPLE_MEMBER_NOT_FOUND))),
            @ApiResponse(responseCode = "409", description = "Dejaría al hogar sin ningún administrador.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "ultimoAdministradorSaliendo", value = EXAMPLE_LAST_ADMIN_LEAVE)))
    })
    @DeleteMapping(path = "/{userId}")
    public ResponseEntity<Void> remove(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Identificador de la persona que sale del hogar. El propio, para salirse.",
                    example = "d90f4c21-77ab-4e35-9f62-1c8b03ad5e47")
            @PathVariable UUID userId) {
        membership.remove(householdId, userId);
        return ResponseEntity.noContent().build();
    }
}
