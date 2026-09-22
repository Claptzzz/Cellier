package com.cellier.recipe.web;

import com.cellier.recipe.RecipeService;
import com.cellier.recipe.dto.CreateRecipeRequest;
import com.cellier.recipe.dto.RecipeAvailabilityFilter;
import com.cellier.recipe.dto.RecipeAvailabilityResponse;
import com.cellier.recipe.dto.RecipeResponse;
import com.cellier.recipe.dto.RecipeSummaryResponse;
import com.cellier.recipe.dto.UpdateRecipeRequest;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/households/{householdId}/recipes")
@Tag(name = "Recipes", description = """
        El recetario del hogar: qué hace falta y cómo se hace.

        Una receta tiene dos partes. Sus **ingredientes** son una lista de productos con
        cantidad, igual que una plantilla, salvo que cada línea puede marcarse **opcional**:
        "sal al gusto" no puede dejar la receta entera en falta porque el bote esté vacío. Sus
        **pasos** son sólo texto ordenado y nunca entran en ese cálculo.

        **El detalle no es el reporte.** `GET /{id}` es la receta tal como se edita, sin
        cruzarla contra la despensa. La disponibilidad —cuánto hay, cuánto falta, si se puede
        cocinar ahora— vive en `GET /{id}/availability`, su propio endpoint: así quien sólo
        abre la receta para leerla o renombrarla no paga ese cruce.

        **La disponibilidad se calcula, no se guarda**, igual que el reporte de compras: para
        cada ingrediente no opcional se compara lo que hace falta con lo que hay en la
        despensa. `READY` exige que haya al menos un ingrediente no opcional y que todos se
        cumplan; una receta sin ninguno —recién creada, o con todo marcado opcional— es
        `MISSING`, no `READY`: no hay nada que comprobar todavía, y eso no es lo mismo que
        estar lista.

        **Cualquier miembro puede crear, editar y borrar recetas.** No es una acción de
        administrador: el recetario es de la casa, no de quien lo escribió.

        Las cantidades van en la **unidad canónica del producto**, como todas las del sistema.
        Un ingrediente por `productName` que no exista en el catálogo se crea en la misma
        transacción; si ya existe con otra unidad, la petición se rechaza con `409` en vez de
        reinterpretar la cantidad.
        """)
@SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME)
public class RecipeController {

    private static final String RECIPE_NOT_FOUND_DESCRIPTION = """
            No existe esa receta en este hogar, o el hogar no es tuyo. Las dos cosas responden
            igual: si respondieran distinto, probar identificadores diría qué hogares
            existen.""";

    private static final String EXAMPLE_LIST = """
            [
              {
                "id": "3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13",
                "name": "Tarta de manzana",
                "ingredientCount": 6,
                "missingCount": 1,
                "availability": "MISSING",
                "createdByName": "Ana Rivas",
                "createdAt": "2026-08-24T15:00:00Z",
                "updatedAt": "2026-09-02T11:20:00Z"
              },
              {
                "id": "b8e4d207-6f91-43ac-95d0-7e2b1c8a06f5",
                "name": "Tortilla de patatas",
                "ingredientCount": 4,
                "missingCount": 0,
                "availability": "READY",
                "createdByName": "Bruno Soto",
                "createdAt": "2026-08-30T19:45:00Z",
                "updatedAt": "2026-08-30T19:45:00Z"
              }
            ]""";

    private static final String EXAMPLE_RECIPE = """
            {
              "id": "3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13",
              "name": "Tarta de manzana",
              "description": "Clásica, con canela y un toque de limón.",
              "servings": 6,
              "prepMinutes": 45,
              "createdByName": "Ana Rivas",
              "createdAt": "2026-08-24T15:00:00Z",
              "updatedAt": "2026-09-02T11:20:00Z",
              "ingredients": [
                {
                  "id": "9c2f5b41-7a03-4e18-bd66-1f8c0a3e5d27",
                  "productId": "7bfdf8ce-50e4-4144-9ec0-21320ce43d14",
                  "productName": "Manzana",
                  "unit": "UNIT",
                  "category": "Frescos",
                  "quantity": 6.000,
                  "optional": false
                },
                {
                  "id": "2a6d90f3-4c18-4e75-b0a9-83f5c1d70e62",
                  "productId": "1d0b6e47-93a5-4c02-8f13-5a7e90c2b4d8",
                  "productName": "Canela",
                  "unit": "G",
                  "category": "Despensa",
                  "quantity": 5.000,
                  "optional": true
                }
              ],
              "steps": [
                { "position": 1, "instruction": "Pelar y laminar las manzanas." },
                { "position": 2, "instruction": "Colocarlas sobre la masa y hornear 40 minutos." }
              ]
            }""";

    private static final String EXAMPLE_AVAILABILITY = """
            {
              "recipeId": "3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13",
              "recipeName": "Tarta de manzana",
              "generatedAt": "2026-08-24T15:00:00Z",
              "availability": "MISSING",
              "missingCount": 1,
              "items": [
                {
                  "productId": "7bfdf8ce-50e4-4144-9ec0-21320ce43d14",
                  "productName": "Manzana",
                  "unit": "UNIT",
                  "category": "Frescos",
                  "quantity": 6.000,
                  "availableQuantity": 2.000,
                  "missingQuantity": 4.000,
                  "optional": false,
                  "sufficient": false
                },
                {
                  "productId": "1d0b6e47-93a5-4c02-8f13-5a7e90c2b4d8",
                  "productName": "Canela",
                  "unit": "G",
                  "category": "Despensa",
                  "quantity": 5.000,
                  "availableQuantity": 0.000,
                  "missingQuantity": 5.000,
                  "optional": true,
                  "sufficient": false
                }
              ]
            }""";

    private static final String EXAMPLE_CREATE = """
            {
              "name": "Tarta de manzana",
              "description": "Clásica, con canela y un toque de limón.",
              "servings": 6,
              "prepMinutes": 45,
              "ingredients": [
                { "productId": "7bfdf8ce-50e4-4144-9ec0-21320ce43d14", "quantity": 6, "optional": false },
                { "productName": "Canela", "unit": "G", "quantity": 5, "optional": true }
              ],
              "steps": [
                "Pelar y laminar las manzanas.",
                "Colocarlas sobre la masa y hornear 40 minutos."
              ]
            }""";

    private static final String EXAMPLE_UNAUTHORIZED = """
            {
              "type": "https://cellier.app/problems/unauthorized",
              "title": "No autenticado",
              "status": 401,
              "detail": "El access token no es válido o ha caducado.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/recipes"
            }""";

    private static final String EXAMPLE_NOT_FOUND = """
            {
              "type": "https://cellier.app/problems/not-found",
              "title": "Recurso no encontrado",
              "status": 404,
              "detail": "No existe esa receta en este hogar.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/recipes/3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13"
            }""";

    private static final String EXAMPLE_FOREIGN_PRODUCT = """
            {
              "type": "https://cellier.app/problems/bad-request",
              "title": "Datos inválidos",
              "status": 400,
              "detail": "El ingrediente 5e1c7b34-8f26-49d0-a7b1-06c3e9f2d845 no es del catálogo de este hogar.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/recipes"
            }""";

    private static final String EXAMPLE_UNIT_CLASH = """
            {
              "type": "https://cellier.app/problems/conflict",
              "title": "Conflicto con el estado actual",
              "status": 409,
              "detail": "«Canela» ya existe en este hogar medido en G, y lo estás enviando en KG. Usa G, o crea un producto con otro nombre.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/recipes"
            }""";

    private final RecipeService recipes;

    public RecipeController(RecipeService recipes) {
        this.recipes = recipes;
    }

    @Operation(
            summary = "Ver las recetas del hogar",
            description = """
                    Ordenadas por nombre, con la disponibilidad de cada una ya calculada: el
                    cliente no necesita pedir el detalle de ninguna para pintar el badge.

                    `availability` filtra en la base, no en el cliente: `READY` sólo trae las
                    que se pueden cocinar ahora mismo, `MISSING` sólo las que no. `search`
                    filtra por nombre, sin distinguir mayúsculas; los dos filtros se resuelven
                    en la misma consulta, y se pueden combinar.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Las recetas del hogar.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            array = @ArraySchema(schema = @Schema(implementation = RecipeSummaryResponse.class)),
                            examples = @ExampleObject(name = "dosRecetas", value = EXAMPLE_LIST))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = "El hogar no existe, o no eres miembro.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class)))
    })
    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public List<RecipeSummaryResponse> list(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Filtra por disponibilidad.", example = "ALL")
            @RequestParam(required = false, defaultValue = "ALL") RecipeAvailabilityFilter availability,
            @Parameter(description = "Filtra por nombre, sin distinguir mayúsculas.", example = "manzana")
            @RequestParam(required = false) String search) {
        return recipes.list(householdId, availability, search);
    }

    @Operation(
            summary = "Crear una receta",
            description = """
                    Se puede crear sin ingredientes ni pasos y completarla después: una receta
                    a medias es un borrador legítimo, no un error.

                    Cada ingrediente se indica con `productId`, si ya es del catálogo de este
                    hogar, o con `productName` y `unit`, y entonces se crea si hace falta. Las
                    dos formas son excluyentes.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Receta creada.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = RecipeResponse.class),
                            examples = @ExampleObject(name = "creada", value = EXAMPLE_RECIPE))),
            @ApiResponse(responseCode = "400",
                    description = "Falta el nombre, algún ingrediente no es del hogar, o viene repetido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "ingredienteAjeno", value = EXAMPLE_FOREIGN_PRODUCT))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = "El hogar no existe, o no eres miembro.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class))),
            @ApiResponse(responseCode = "409",
                    description = "Un ingrediente por nombre ya existe en el hogar con otra unidad.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "choqueDeUnidad", value = EXAMPLE_UNIT_CLASH)))
    })
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<RecipeResponse> create(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,

            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    required = true,
                    content = @Content(examples = @ExampleObject(name = "conIngredientes", value = EXAMPLE_CREATE)))
            @Valid @RequestBody CreateRecipeRequest request) {

        RecipeResponse created = recipes.create(householdId, request);
        return ResponseEntity
                .created(URI.create("/api/v1/households/" + householdId + "/recipes/" + created.id()))
                .body(created);
    }

    @Operation(
            summary = "Ver una receta con sus ingredientes y pasos",
            description = """
                    La receta tal como se edita: nombre, descripción, raciones, minutos, sus
                    ingredientes sin cruzar contra la despensa, y sus pasos en orden.

                    No trae disponibilidad. Para saber si se puede cocinar ahora mismo, usa
                    `GET /{id}/availability`.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "La receta.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = RecipeResponse.class),
                            examples = @ExampleObject(name = "receta", value = EXAMPLE_RECIPE))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = RECIPE_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "recetaAjena", value = EXAMPLE_NOT_FOUND)))
    })
    @GetMapping(path = "/{recipeId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public RecipeResponse get(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Identificador de la receta.",
                    example = "3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13")
            @PathVariable UUID recipeId) {
        return recipes.get(householdId, recipeId);
    }

    @Operation(
            summary = "Ver si una receta se puede cocinar ahora mismo",
            description = """
                    Cruza cada ingrediente no opcional contra la despensa. Para cada uno:
                    cuánto hace falta, cuánto hay, y cuánto falta —nunca negativo—.

                    `READY` exige al menos un ingrediente no opcional y que todos se cumplan;
                    una receta sin ninguno es `MISSING`, no `READY`.

                    **Se calcula al vuelo y no se guarda.** Es cierta en el instante que declara
                    `generatedAt`, y no pretende serlo después.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "La disponibilidad, calculada ahora.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = RecipeAvailabilityResponse.class),
                            examples = @ExampleObject(name = "conFaltantes", value = EXAMPLE_AVAILABILITY))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = RECIPE_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "recetaAjena", value = EXAMPLE_NOT_FOUND)))
    })
    @GetMapping(path = "/{recipeId}/availability", produces = MediaType.APPLICATION_JSON_VALUE)
    public RecipeAvailabilityResponse availability(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Identificador de la receta.",
                    example = "3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13")
            @PathVariable UUID recipeId) {
        return recipes.availability(householdId, recipeId);
    }

    @Operation(
            summary = "Reemplazar una receta entera",
            description = """
                    **Reemplazo completo, no fusión.** Nombre, descripción, raciones, minutos,
                    ingredientes y pasos a la vez: lo que no venga en `ingredients` o en `steps`
                    deja de estar en la receta.

                    Los pasos se renumeran por su posición en la lista que se manda: el primero
                    es el paso 1, sin importar qué posición tuviera antes.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Receta reemplazada.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = RecipeResponse.class),
                            examples = @ExampleObject(name = "reemplazada", value = EXAMPLE_RECIPE))),
            @ApiResponse(responseCode = "400",
                    description = "Falta el nombre, algún ingrediente no es del hogar, o viene repetido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "ingredienteAjeno", value = EXAMPLE_FOREIGN_PRODUCT))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = RECIPE_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "recetaAjena", value = EXAMPLE_NOT_FOUND))),
            @ApiResponse(responseCode = "409",
                    description = "Un ingrediente por nombre ya existe en el hogar con otra unidad.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "choqueDeUnidad", value = EXAMPLE_UNIT_CLASH)))
    })
    @PutMapping(path = "/{recipeId}",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public RecipeResponse update(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Identificador de la receta.",
                    example = "3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13")
            @PathVariable UUID recipeId,
            @Valid @RequestBody UpdateRecipeRequest request) {
        return recipes.update(householdId, recipeId, request);
    }

    @Operation(
            summary = "Borrar una receta",
            description = """
                    Se lleva sus ingredientes y sus pasos con ella. No toca la despensa ni el
                    catálogo: una receta dice qué hace falta, no lo que hay.

                    Cualquier miembro puede borrarla, también si no fue quien la creó.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Receta borrada."),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = RECIPE_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "recetaAjena", value = EXAMPLE_NOT_FOUND)))
    })
    @DeleteMapping(path = "/{recipeId}")
    public ResponseEntity<Void> delete(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Identificador de la receta.",
                    example = "3f7c1a90-9d4e-4b22-8f61-2c5a7e0d4b13")
            @PathVariable UUID recipeId) {
        recipes.delete(householdId, recipeId);
        return ResponseEntity.noContent().build();
    }
}
