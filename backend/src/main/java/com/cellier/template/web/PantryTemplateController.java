package com.cellier.template.web;

import com.cellier.shared.config.OpenApiConfig;
import com.cellier.template.PantryTemplateService;
import com.cellier.template.dto.CreateTemplateRequest;
import com.cellier.template.dto.RenameTemplateRequest;
import com.cellier.template.dto.ReplaceItemsRequest;
import com.cellier.template.dto.TemplateResponse;
import com.cellier.template.dto.TemplateSummaryResponse;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/households/{householdId}/templates")
@Tag(name = "Templates", description = """
        Plantillas de despensa: lo que el hogar quiere tener en casa.

        Una plantilla es una **lista de deseos con cantidades** —«de esto quiero tener diez»—,
        no una compra ni un estado. Es el listón contra el que se mide la despensa: de restar
        una cosa de la otra sale el reporte de compras.

        Un hogar puede tener varias, porque la compra semanal no se parece a la del asado.

        **Cualquier miembro puede crear, editar y borrar plantillas.** No es una acción de
        administrador: las plantillas son de la casa, no de quien las escribió. Por eso
        `createdBy` viaja como dato y nunca como autoridad.

        Las cantidades van en la **unidad canónica del producto**, como todas las del sistema.
        """)
@SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME)
public class PantryTemplateController {

    private static final String TEMPLATE_NOT_FOUND_DESCRIPTION = """
            No existe esa plantilla en este hogar, o el hogar no es tuyo. Las dos cosas
            responden igual: si respondieran distinto, probar identificadores diría qué
            hogares existen.""";

    private static final String EXAMPLE_LIST = """
            [
              {
                "id": "3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13",
                "name": "Compra semanal",
                "itemCount": 12,
                "createdAt": "2026-08-24T15:00:00Z",
                "updatedAt": "2026-09-02T11:20:00Z"
              },
              {
                "id": "b8e4d207-6f91-43ac-95d0-7e2b1c8a06f5",
                "name": "Asado del domingo",
                "itemCount": 5,
                "createdAt": "2026-08-30T19:45:00Z",
                "updatedAt": "2026-08-30T19:45:00Z"
              }
            ]""";

    private static final String EXAMPLE_TEMPLATE = """
            {
              "id": "3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13",
              "name": "Compra semanal",
              "createdByName": "Ana Rivas",
              "createdAt": "2026-08-24T15:00:00Z",
              "updatedAt": "2026-09-02T11:20:00Z",
              "items": [
                {
                  "id": "9c2f5b41-7a03-4e18-bd66-1f8c0a3e5d27",
                  "productId": "7bfdf8ce-50e4-4144-9ec0-21320ce43d14",
                  "productName": "Huevos",
                  "unit": "UNIT",
                  "category": "Frescos",
                  "desiredQuantity": 10.000
                },
                {
                  "id": "2a6d90f3-4c18-4e75-b0a9-83f5c1d70e62",
                  "productId": "1d0b6e47-93a5-4c02-8f13-5a7e90c2b4d8",
                  "productName": "Salsa de tomate",
                  "unit": "ML",
                  "category": "Despensa",
                  "desiredQuantity": 1000.000
                }
              ]
            }""";

    private static final String EXAMPLE_CREATE = """
            {
              "name": "Compra semanal",
              "items": [
                { "productId": "7bfdf8ce-50e4-4144-9ec0-21320ce43d14", "desiredQuantity": 10 },
                { "productId": "1d0b6e47-93a5-4c02-8f13-5a7e90c2b4d8", "desiredQuantity": 1000 }
              ]
            }""";

    private static final String EXAMPLE_UNAUTHORIZED = """
            {
              "type": "https://cellier.app/problems/unauthorized",
              "title": "No autenticado",
              "status": 401,
              "detail": "El access token no es válido o ha caducado.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/templates"
            }""";

    private static final String EXAMPLE_NOT_FOUND = """
            {
              "type": "https://cellier.app/problems/not-found",
              "title": "No encontrado",
              "status": 404,
              "detail": "No existe esa plantilla en este hogar.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/templates/3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13"
            }""";

    private static final String EXAMPLE_DUPLICATE_NAME = """
            {
              "type": "https://cellier.app/problems/conflict",
              "title": "Conflicto con el estado actual",
              "status": 409,
              "detail": "Ya hay una plantilla llamada «Compra semanal» en este hogar. Usa otro nombre, o edita la que ya existe.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/templates"
            }""";

    private static final String EXAMPLE_FOREIGN_PRODUCT = """
            {
              "type": "https://cellier.app/problems/bad-request",
              "title": "Datos inválidos",
              "status": 400,
              "detail": "La lista trae 1 producto(s) que no son del catálogo de este hogar. Quítalos o créalos antes de guardar la plantilla: [5e1c7b34-8f26-49d0-a7b1-06c3e9f2d845].",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/templates/3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13/items"
            }""";

    private final PantryTemplateService templates;

    public PantryTemplateController(PantryTemplateService templates) {
        this.templates = templates;
    }

    @Operation(
            summary = "Ver las plantillas del hogar",
            description = """
                    Ordenadas por nombre, con el número de productos de cada una. El recuento
                    sale de la misma consulta: traer las líneas enteras para contarlas y
                    tirarlas sería pedir todo para usar un número.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Las plantillas del hogar.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            array = @ArraySchema(schema = @Schema(implementation = TemplateSummaryResponse.class)),
                            examples = @ExampleObject(name = "dosPlantillas", value = EXAMPLE_LIST))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = "El hogar no existe, o no eres miembro.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class)))
    })
    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public List<TemplateSummaryResponse> list(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId) {
        return templates.list(householdId);
    }

    @Operation(
            summary = "Crear una plantilla",
            description = """
                    Se puede crear vacía y llenarla después: una plantilla sin productos es un
                    borrador legítimo, no un error.

                    Todos los `productId` tienen que ser del catálogo de **este** hogar, y se
                    comprueban en bloque antes de escribir nada.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Plantilla creada.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = TemplateResponse.class),
                            examples = @ExampleObject(name = "creada", value = EXAMPLE_TEMPLATE))),
            @ApiResponse(responseCode = "400", description = "Falta el nombre, o algún producto no es del hogar.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "productoAjeno", value = EXAMPLE_FOREIGN_PRODUCT))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = "El hogar no existe, o no eres miembro.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class))),
            @ApiResponse(responseCode = "409", description = "Ya hay una plantilla con ese nombre.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "nombreRepetido", value = EXAMPLE_DUPLICATE_NAME)))
    })
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<TemplateResponse> create(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,

            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    required = true,
                    content = @Content(examples = @ExampleObject(name = "conProductos", value = EXAMPLE_CREATE)))
            @Valid @RequestBody CreateTemplateRequest request) {

        TemplateResponse created = templates.create(householdId, request);
        return ResponseEntity
                .created(URI.create("/api/v1/households/" + householdId + "/templates/" + created.id()))
                .body(created);
    }

    @Operation(
            summary = "Ver una plantilla con sus productos",
            description = "La plantilla entera: sus líneas, con el nombre y la unidad de cada producto.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "La plantilla.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = TemplateResponse.class),
                            examples = @ExampleObject(name = "plantilla", value = EXAMPLE_TEMPLATE))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = TEMPLATE_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "plantillaAjena", value = EXAMPLE_NOT_FOUND)))
    })
    @GetMapping(path = "/{templateId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public TemplateResponse get(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Identificador de la plantilla.",
                    example = "3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13")
            @PathVariable UUID templateId) {
        return templates.get(householdId, templateId);
    }

    @Operation(
            summary = "Renombrar una plantilla",
            description = """
                    Lo único que se edita de la plantilla en sí. Sus productos van por
                    `PUT /items`, que reemplaza la lista entera.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Plantilla renombrada.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = TemplateResponse.class),
                            examples = @ExampleObject(name = "renombrada", value = EXAMPLE_TEMPLATE))),
            @ApiResponse(responseCode = "400", description = "El nombre falta o es demasiado largo.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = TEMPLATE_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "plantillaAjena", value = EXAMPLE_NOT_FOUND))),
            @ApiResponse(responseCode = "409", description = "Ya hay otra plantilla con ese nombre.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "nombreRepetido", value = EXAMPLE_DUPLICATE_NAME)))
    })
    @PatchMapping(path = "/{templateId}",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public TemplateResponse rename(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Identificador de la plantilla.",
                    example = "3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13")
            @PathVariable UUID templateId,
            @Valid @RequestBody RenameTemplateRequest request) {
        return templates.rename(householdId, templateId, request);
    }

    @Operation(
            summary = "Borrar una plantilla",
            description = """
                    Se lleva sus líneas con ella. No toca la despensa ni el catálogo: una
                    plantilla dice lo que se quiere tener, no lo que hay.

                    Cualquier miembro puede borrarla, también si no fue quien la creó.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Plantilla borrada."),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = TEMPLATE_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "plantillaAjena", value = EXAMPLE_NOT_FOUND)))
    })
    @DeleteMapping(path = "/{templateId}")
    public ResponseEntity<Void> delete(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Identificador de la plantilla.",
                    example = "3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13")
            @PathVariable UUID templateId) {
        templates.delete(householdId, templateId);
        return ResponseEntity.noContent().build();
    }

    @Operation(
            summary = "Reemplazar los productos de una plantilla",
            description = """
                    **Reemplazo completo, no fusión.** Manda la lista que quieres tener; lo que
                    no venga deja de estar. Se edita como un bloque, así que no hace falta un
                    lenguaje de altas y bajas.

                    Se valida **todo antes de escribir nada**: que no venga el mismo producto
                    dos veces y que todos sean del catálogo de este hogar. Un reemplazo a
                    medias dejaría la plantilla en un estado que nadie pidió —ni el anterior ni
                    el que se mandó—, y el error llegaría como una violación de integridad en
                    vez de un mensaje que dice qué línea sobra.

                    Una lista vacía deja la plantilla sin productos, que es distinto de
                    borrarla.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Lista reemplazada.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = TemplateResponse.class),
                            examples = @ExampleObject(name = "reemplazada", value = EXAMPLE_TEMPLATE))),
            @ApiResponse(responseCode = "400",
                    description = "Algún producto no es del hogar, viene repetido, o la cantidad no es mayor que cero.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "productoAjeno", value = EXAMPLE_FOREIGN_PRODUCT))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = TEMPLATE_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "plantillaAjena", value = EXAMPLE_NOT_FOUND)))
    })
    @PutMapping(path = "/{templateId}/items",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public TemplateResponse replaceItems(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Identificador de la plantilla.",
                    example = "3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13")
            @PathVariable UUID templateId,
            @Valid @RequestBody ReplaceItemsRequest request) {
        return templates.replaceItems(householdId, templateId, request);
    }
}
