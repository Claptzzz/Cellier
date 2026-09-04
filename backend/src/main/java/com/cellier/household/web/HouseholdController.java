package com.cellier.household.web;

import com.cellier.household.HouseholdService;
import com.cellier.household.dto.CreateHouseholdRequest;
import com.cellier.household.dto.HouseholdDetailResponse;
import com.cellier.household.dto.HouseholdSummaryResponse;
import com.cellier.household.dto.JoinCodeResponse;
import com.cellier.household.dto.UpdateHouseholdRequest;
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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/households")
@Tag(name = "Households", description = """
        Hogares: el ámbito al que pertenece todo lo demás en Cellier.

        Cada operación sobre un hogar concreto comprueba primero la membresía del usuario
        autenticado. **Un hogar al que no perteneces responde `404`, no `403`**, exista o no:
        la API no confirma la existencia de hogares ajenos. El `403` queda para el miembro que
        se queda corto de rol, donde ya no se revela nada nuevo.
        """)
@SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME)
public class HouseholdController {

    private static final String EXAMPLE_SUMMARY_LIST = """
            [
              {
                "id": "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98",
                "name": "Casa Rivas",
                "role": "ADMIN",
                "memberCount": 3
              },
              {
                "id": "b41d0f77-6c58-4e92-8a03-5fd91c2e7a64",
                "name": "Depa Ñuñoa",
                "role": "MEMBER",
                "memberCount": 2
              }
            ]""";

    private static final String EXAMPLE_DETAIL = """
            {
              "id": "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98",
              "name": "Casa Rivas",
              "joinCode": "K7M2QP9X",
              "role": "ADMIN",
              "memberCount": 3,
              "createdAt": "2026-09-03T18:42:11Z"
            }""";

    private static final String EXAMPLE_DETAIL_CREATED = """
            {
              "id": "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98",
              "name": "Casa Rivas",
              "joinCode": "K7M2QP9X",
              "role": "ADMIN",
              "memberCount": 1,
              "createdAt": "2026-09-03T18:42:11Z"
            }""";

    private static final String EXAMPLE_JOIN_CODE = """
            {
              "joinCode": "T4WB8HRN"
            }""";

    private static final String EXAMPLE_UNAUTHORIZED = """
            {
              "type": "https://cellier.app/problems/unauthorized",
              "title": "No autenticado",
              "status": 401,
              "detail": "Se requiere un access token válido.",
              "instance": "/api/v1/households"
            }""";

    private static final String EXAMPLE_NOT_FOUND = """
            {
              "type": "https://cellier.app/problems/not-found",
              "title": "Recurso no encontrado",
              "status": 404,
              "detail": "No existe ese hogar, o no eres miembro de él.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98"
            }""";

    private static final String EXAMPLE_FORBIDDEN = """
            {
              "type": "https://cellier.app/problems/forbidden",
              "title": "Operación no permitida",
              "status": 403,
              "detail": "Esta operación requiere rol de administrador en el hogar.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98"
            }""";

    private static final String EXAMPLE_VALIDATION = """
            {
              "type": "https://cellier.app/problems/bad-request",
              "title": "Datos inválidos",
              "status": 400,
              "detail": "Uno o más campos del cuerpo de la petición no son válidos.",
              "instance": "/api/v1/households",
              "errors": { "name": "El nombre del hogar es obligatorio" }
            }""";

    /** Texto reutilizado en las respuestas 404, para que la razón del 404 se lea en cada endpoint. */
    private static final String NOT_FOUND_DESCRIPTION =
            "El hogar no existe, o existe pero el usuario autenticado no es miembro. "
                    + "La API no distingue ambos casos a propósito.";

    private final HouseholdService households;

    public HouseholdController(HouseholdService households) {
        this.households = households;
    }

    @Operation(
            summary = "Listar mis hogares",
            description = """
                    Los hogares a los que pertenece el usuario autenticado, con su rol en cada
                    uno y el número de personas del grupo.

                    El orden es estable entre llamadas —por nombre, y por identificador a
                    igualdad de nombre—, para que un selector de hogar en el cliente no se
                    reordene solo. La lista no incluye el código de ingreso: ese dato sale
                    únicamente por el detalle del hogar.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Hogares del usuario. Lista vacía si aún no pertenece a ninguno.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            array = @ArraySchema(schema = @Schema(implementation = HouseholdSummaryResponse.class)),
                            examples = @ExampleObject(name = "misHogares", value = EXAMPLE_SUMMARY_LIST))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED)))
    })
    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public List<HouseholdSummaryResponse> listMine() {
        return households.listMine();
    }

    @Operation(
            summary = "Crear un hogar",
            description = """
                    Crea el hogar y deja a quien lo crea dentro como **administrador**, en la
                    misma operación. Un hogar sin administrador sería inadministrable, así que
                    esa membresía no es un paso aparte que se pueda olvidar.

                    El código de ingreso se genera aquí y viaja en la respuesta.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Hogar creado. La cabecera `Location` apunta a su detalle.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = HouseholdDetailResponse.class),
                            examples = @ExampleObject(name = "hogarCreado", value = EXAMPLE_DETAIL_CREATED))),
            @ApiResponse(responseCode = "400", description = "El nombre falta, está en blanco o pasa de 80 caracteres.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "nombreVacio", value = EXAMPLE_VALIDATION))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED)))
    })
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<HouseholdDetailResponse> create(@Valid @RequestBody CreateHouseholdRequest request) {
        HouseholdDetailResponse created = households.create(request);
        return ResponseEntity.created(URI.create("/api/v1/households/" + created.id())).body(created);
    }

    @Operation(
            summary = "Ver un hogar",
            description = """
                    Detalle del hogar. Lo puede consultar cualquier miembro, con rol
                    `ADMIN` o `MEMBER`.

                    Es el **único** punto de la API por el que sale el `joinCode`, y solo
                    después de comprobar la membresía: cualquier miembro puede compartir el
                    código, pero nadie ajeno al hogar llega a verlo.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Detalle del hogar.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = HouseholdDetailResponse.class),
                            examples = @ExampleObject(name = "detalle", value = EXAMPLE_DETAIL))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "hogarAjenoOInexistente", value = EXAMPLE_NOT_FOUND)))
    })
    @GetMapping(path = "/{householdId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public HouseholdDetailResponse get(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId) {
        return households.get(householdId);
    }

    @Operation(
            summary = "Renombrar un hogar",
            description = "Cambia el nombre del hogar. Solo un administrador puede hacerlo.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Hogar actualizado.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = HouseholdDetailResponse.class),
                            examples = @ExampleObject(name = "detalle", value = EXAMPLE_DETAIL))),
            @ApiResponse(responseCode = "400", description = "El nombre falta, está en blanco o pasa de 80 caracteres.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "nombreVacio", value = EXAMPLE_VALIDATION))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "403", description = "El usuario es miembro del hogar, pero no administrador.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "noEsAdmin", value = EXAMPLE_FORBIDDEN))),
            @ApiResponse(responseCode = "404", description = NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "hogarAjenoOInexistente", value = EXAMPLE_NOT_FOUND)))
    })
    @PatchMapping(path = "/{householdId}",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public HouseholdDetailResponse rename(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Valid @RequestBody UpdateHouseholdRequest request) {
        return households.rename(householdId, request);
    }

    @Operation(
            summary = "Eliminar un hogar",
            description = """
                    Borra el hogar **y todo su contenido**: membresías, solicitudes de ingreso
                    y, a medida que existan, despensa, plantillas y recetas. La operación no
                    tiene vuelta atrás y no exige que el hogar se quede antes sin miembros.

                    Solo un administrador puede hacerlo.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Hogar eliminado.", content = @Content),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "403", description = "El usuario es miembro del hogar, pero no administrador.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "noEsAdmin", value = EXAMPLE_FORBIDDEN))),
            @ApiResponse(responseCode = "404", description = NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "hogarAjenoOInexistente", value = EXAMPLE_NOT_FOUND)))
    })
    @DeleteMapping(path = "/{householdId}")
    public ResponseEntity<Void> delete(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId) {
        households.delete(householdId);
        return ResponseEntity.noContent().build();
    }

    @Operation(
            summary = "Regenerar el código de ingreso",
            description = """
                    Emite un código nuevo y **anula el anterior en el acto**: quien lo tuviera
                    apuntado ya no podrá usarlo para solicitar el ingreso. Es la respuesta a
                    que un código se haya difundido más de la cuenta.

                    Las solicitudes ya enviadas no se ven afectadas: siguen pendientes de que
                    un administrador las resuelva. Solo un administrador puede regenerar.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Código regenerado.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = JoinCodeResponse.class),
                            examples = @ExampleObject(name = "codigoNuevo", value = EXAMPLE_JOIN_CODE))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "403", description = "El usuario es miembro del hogar, pero no administrador.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "noEsAdmin", value = EXAMPLE_FORBIDDEN))),
            @ApiResponse(responseCode = "404", description = NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "hogarAjenoOInexistente", value = EXAMPLE_NOT_FOUND)))
    })
    @PostMapping(path = "/{householdId}/join-code:regenerate", produces = MediaType.APPLICATION_JSON_VALUE)
    public JoinCodeResponse regenerateJoinCode(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId) {
        return households.regenerateJoinCode(householdId);
    }
}
