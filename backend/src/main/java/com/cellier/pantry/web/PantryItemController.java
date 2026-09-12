package com.cellier.pantry.web;

import com.cellier.pantry.PantryService;
import com.cellier.pantry.PantryService.PantrySort;
import com.cellier.pantry.dto.PageResponse;
import com.cellier.pantry.dto.StockMovementResponse;
import com.cellier.pantry.dto.CreatePantryItemRequest;
import com.cellier.pantry.dto.PantryItemResponse;
import com.cellier.pantry.dto.QuantityRequest;
import com.cellier.pantry.dto.UpdatePantryItemRequest;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/households/{householdId}/pantry/items")
@Tag(name = "Pantry", description = """
        La despensa del hogar: qué hay y cuánto.

        Cada artículo es un producto del catálogo con su cantidad, expresada **en la unidad
        canónica de ese producto**. No hay conversión, así que comparar lo que hay con lo que
        hace falta es una resta.

        **Toda modificación deja un movimiento**, y la suma de los movimientos de un artículo
        es su cantidad actual. Por eso consumir registra lo que se gastó de verdad —que puede
        ser menos de lo pedido, si no había tanto— y un ajuste que no cambia la cantidad no
        escribe nada.

        Los artículos llevan **bloqueo optimista**: si otra persona del hogar modificó el
        mismo producto entre tu lectura y tu escritura, la petición responde `409` en vez de
        pisar su cambio.
        """)
@SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME)
public class PantryItemController {

    private static final String EXAMPLE_ITEM = """
            {
              "id": "7a1c4e93-6d05-4b28-91f7-0c3a8d5e2b46",
              "product": {
                "id": "c15f8d32-7b40-4e29-8c61-a4d09e7b2f53",
                "name": "Salsa de tomate",
                "unit": "ML",
                "category": "Despensa"
              },
              "quantity": 690.000,
              "expiresAt": "2026-10-04",
              "parLevel": 1000.000,
              "storageLocation": "PANTRY",
              "version": 3
            }""";

    private static final String EXAMPLE_CONSUMED = """
            {
              "id": "b4d7f018-3c92-4a65-8e10-5f7b2c9d0e83",
              "product": {
                "id": "5e8b0fd1-c0cf-430d-b327-29adc79900ae",
                "name": "Huevos",
                "unit": "UNIT",
                "category": "Nevera"
              },
              "quantity": 0.000,
              "expiresAt": "2026-09-25",
              "parLevel": 12.000,
              "storageLocation": "FRIDGE",
              "version": 4
            }""";

    private static final String EXAMPLE_LIST = """
            [
              {
                "id": "b4d7f018-3c92-4a65-8e10-5f7b2c9d0e83",
                "product": { "id": "5e8b0fd1-c0cf-430d-b327-29adc79900ae", "name": "Huevos", "unit": "UNIT", "category": "Nevera" },
                "quantity": 4.000,
                "expiresAt": "2026-09-25",
                "parLevel": 12.000,
                "storageLocation": "FRIDGE",
                "version": 2
              },
              {
                "id": "9d3b6a71-40e5-4c82-b937-6e1a0f8c2d54",
                "product": { "id": "9b2e7c04-5a16-4f83-a0d7-3e8b1c5f9204", "name": "Lechuga", "unit": "UNIT", "category": "Nevera" },
                "quantity": 1.000,
                "parLevel": null,
                "version": 0
              },
              {
                "id": "7a1c4e93-6d05-4b28-91f7-0c3a8d5e2b46",
                "product": { "id": "c15f8d32-7b40-4e29-8c61-a4d09e7b2f53", "name": "Salsa de tomate", "unit": "ML", "category": "Despensa" },
                "quantity": 690.000,
                "expiresAt": "2026-10-04",
                "parLevel": 1000.000,
                "storageLocation": "PANTRY",
                "version": 3
              }
            ]""";

    private static final String EXAMPLE_MOVEMENTS = """
            {
              "content": [
                {
                  "id": "e2b1f704-9c38-4d56-a7e0-84f1c6b03d29",
                  "type": "CONSUMPTION",
                  "delta": -240.000,
                  "performedAt": "2026-09-12T14:05:33Z",
                  "performedByUserId": "3f1c9a2e-5b7d-4a10-9c88-2f0e6b4d1a73",
                  "performedByName": "Ana Rivas"
                },
                {
                  "id": "5c0a9d38-6e17-42b9-8f04-1d7e3b2a6c95",
                  "type": "PURCHASE",
                  "delta": 690.000,
                  "performedAt": "2026-09-04T09:15:02Z",
                  "performedByUserId": "3f1c9a2e-5b7d-4a10-9c88-2f0e6b4d1a73",
                  "performedByName": "Ana Rivas"
                }
              ],
              "page": 0,
              "size": 20,
              "totalElements": 2,
              "totalPages": 1
            }""";

    private static final String EXAMPLE_UNAUTHORIZED = """
            {
              "type": "https://cellier.app/problems/unauthorized",
              "title": "No autenticado",
              "status": 401,
              "detail": "Se requiere un access token válido.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/pantry/items"
            }""";

    private static final String EXAMPLE_HOUSEHOLD_NOT_FOUND = """
            {
              "type": "https://cellier.app/problems/not-found",
              "title": "Recurso no encontrado",
              "status": 404,
              "detail": "No existe ese hogar, o no eres miembro de él.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/pantry/items"
            }""";

    private static final String EXAMPLE_ITEM_NOT_FOUND = """
            {
              "type": "https://cellier.app/problems/not-found",
              "title": "Recurso no encontrado",
              "status": 404,
              "detail": "No existe ese artículo en la despensa de este hogar.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/pantry/items/7a1c4e93-6d05-4b28-91f7-0c3a8d5e2b46"
            }""";

    private static final String EXAMPLE_UNIT_MISMATCH = """
            {
              "type": "https://cellier.app/problems/conflict",
              "title": "Conflicto con el estado actual",
              "status": 409,
              "detail": "«Leche» ya existe en este hogar medido en L, y lo estás enviando en G. Usa L, o crea un producto con otro nombre.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/pantry/items"
            }""";

    private static final String EXAMPLE_ALREADY_IN_PANTRY = """
            {
              "type": "https://cellier.app/problems/conflict",
              "title": "Conflicto con el estado actual",
              "status": 409,
              "detail": "«Lechuga» ya está en la despensa. Usa reponer para sumar a lo que hay, o edítalo para corregir la cantidad.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/pantry/items"
            }""";

    private static final String EXAMPLE_OPTIMISTIC_LOCK = """
            {
              "type": "https://cellier.app/problems/conflict",
              "title": "Conflicto con el estado actual",
              "status": 409,
              "detail": "Otro miembro del hogar actualizó este producto mientras lo editabas. Recarga para ver cómo quedó y vuelve a intentarlo.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/pantry/items/7a1c4e93-6d05-4b28-91f7-0c3a8d5e2b46:consume"
            }""";

    private static final String EXAMPLE_VALIDATION = """
            {
              "type": "https://cellier.app/problems/bad-request",
              "title": "Datos inválidos",
              "status": 400,
              "detail": "Uno o más campos del cuerpo de la petición no son válidos.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/pantry/items/7a1c4e93-6d05-4b28-91f7-0c3a8d5e2b46:consume",
              "errors": { "quantity": "La cantidad tiene que ser mayor que cero" }
            }""";

    private static final String HOUSEHOLD_NOT_FOUND_DESCRIPTION =
            "El hogar no existe, o existe pero el usuario autenticado no es miembro. "
                    + "La API no distingue ambos casos a propósito.";

    private static final String ITEM_NOT_FOUND_DESCRIPTION =
            "El hogar no es accesible, o el artículo no pertenece a la despensa de este hogar.";

    private final PantryService pantry;

    public PantryItemController(PantryService pantry) {
        this.pantry = pantry;
    }

    @Operation(
            summary = "Ver la despensa",
            description = """
                    Los artículos del hogar, **filtrados y ordenados en el servidor**.

                    No se pagina: una despensa doméstica es corta. Sí se filtra y se ordena
                    aquí, para que el cliente no se traiga todo y rehaga el trabajo en cada
                    pantalla.

                    Órdenes disponibles:

                    - `name` (por defecto), alfabético.
                    - `quantity`, de menos a más: en una despensa lo que se mira es qué se
                      está acabando, no qué sobra.
                    - `expiry`, lo que vence antes primero, **con los artículos sin fecha al
                      final**: no tener vencimiento no es vencer muy tarde, es no estar en esa
                      lista.

                    Cada artículo trae `quantity` y `parLevel`, que es lo que necesita la
                    banda de nivel para dibujar una proporción. **`parLevel` viaja como `null`
                    cuando no hay objetivo**, a diferencia del resto de campos nulos de la
                    API, que se omiten: «no hay objetivo» y «el objetivo es cero» llevan a
                    dibujos distintos.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Artículos del hogar. Lista vacía si la despensa está vacía.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            array = @ArraySchema(schema = @Schema(implementation = PantryItemResponse.class)),
                            examples = @ExampleObject(name = "despensa", value = EXAMPLE_LIST))),
            @ApiResponse(responseCode = "400", description = "El orden pedido no existe.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = HOUSEHOLD_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "hogarAjeno", value = EXAMPLE_HOUSEHOLD_NOT_FOUND)))
    })
    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public List<PantryItemResponse> list(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Filtra por nombre del producto, sin distinguir mayúsculas.",
                    example = "tomate")
            @RequestParam(required = false) String search,
            @Parameter(description = "Filtra por categoría exacta, sin distinguir mayúsculas.",
                    example = "Nevera")
            @RequestParam(required = false) String category,
            @Parameter(description = "Criterio de orden.", example = "expiry")
            @RequestParam(required = false, defaultValue = "NAME") PantrySort sort) {
        return pantry.list(householdId, search, category, sort);
    }

    @Operation(
            summary = "Ver el historial de un artículo",
            description = """
                    Los movimientos del artículo, de lo más reciente a lo más antiguo.

                    **Esto sí se pagina**, al revés que la despensa: el historial sólo crece, y
                    el de un producto que se compra cada semana llega a miles de filas en un
                    par de años. `size` vale 20 por defecto y como mucho 100.

                    La suma de los `delta` de todas las páginas es la cantidad actual del
                    artículo. Quien hizo cada movimiento puede venir en `null`: el historial no
                    se reescribe cuando alguien deja el hogar.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Una página del historial.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = PageResponse.class),
                            examples = @ExampleObject(name = "historial", value = EXAMPLE_MOVEMENTS))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = ITEM_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "articuloAjeno", value = EXAMPLE_ITEM_NOT_FOUND)))
    })
    @GetMapping(path = "/{itemId}/movements", produces = MediaType.APPLICATION_JSON_VALUE)
    public PageResponse<StockMovementResponse> movements(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Identificador del artículo.",
                    example = "7a1c4e93-6d05-4b28-91f7-0c3a8d5e2b46")
            @PathVariable UUID itemId,
            @Parameter(description = "Número de página, empezando en 0.", example = "0")
            @RequestParam(required = false, defaultValue = "0") int page,
            @Parameter(description = "Elementos por página. Máximo 100.", example = "20")
            @RequestParam(required = false, defaultValue = "20") int size) {
        return pantry.movements(householdId, itemId, page, size);
    }

    @Operation(
            summary = "Añadir un producto a la despensa",
            description = """
                    El producto se indica de una de dos formas: con `productId`, si ya está en
                    el catálogo, o con `productName` y `unit`, y entonces **se crea el producto
                    y el artículo en la misma transacción**.

                    Si ya hay un producto con ese nombre en el hogar —sin distinguir
                    mayúsculas— se reutiliza. Pero si su unidad no coincide con la enviada,
                    responde `409`: sin conversión de unidades, reutilizarlo guardaría «2 L»
                    como 2 G y ese dato falso llegaría al reporte de compras y a la
                    disponibilidad de recetas sin que nadie lo notara.

                    Si ese producto ya está en la despensa, responde `409`: para sumar a lo
                    que hay está reponer.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Artículo añadido a la despensa.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = PantryItemResponse.class),
                            examples = @ExampleObject(name = "anadido", value = EXAMPLE_ITEM))),
            @ApiResponse(responseCode = "400", description = "Falta la cantidad, o algún campo no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "cantidadInvalida", value = EXAMPLE_VALIDATION))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = HOUSEHOLD_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "hogarAjeno", value = EXAMPLE_HOUSEHOLD_NOT_FOUND))),
            @ApiResponse(responseCode = "409", description = "La unidad no coincide con la del producto existente, o ya está en la despensa.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = {
                                    @ExampleObject(name = "unidadDistinta", value = EXAMPLE_UNIT_MISMATCH),
                                    @ExampleObject(name = "yaEstaEnLaDespensa", value = EXAMPLE_ALREADY_IN_PANTRY)
                            }))
    })
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<PantryItemResponse> create(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Valid @RequestBody CreatePantryItemRequest request) {
        PantryItemResponse created = pantry.create(householdId, request);
        return ResponseEntity
                .created(URI.create("/api/v1/households/" + householdId + "/pantry/items/" + created.id()))
                .body(created);
    }

    @Operation(
            summary = "Editar un artículo",
            description = """
                    Los campos que no se envíen se dejan intactos.

                    **Fijar `quantity` registra un movimiento de tipo `ADJUSTMENT`**, porque es
                    alguien corrigiendo a mano lo que el sistema creía tener. Para gastar o
                    reponer están `:consume` y `:restock`, que además dicen *qué* pasó. Si la
                    cantidad enviada es la que ya había, no se registra nada.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Artículo actualizado.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = PantryItemResponse.class),
                            examples = @ExampleObject(name = "actualizado", value = EXAMPLE_ITEM))),
            @ApiResponse(responseCode = "400", description = "Algún campo enviado no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "cantidadInvalida", value = EXAMPLE_VALIDATION))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = ITEM_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "articuloAjeno", value = EXAMPLE_ITEM_NOT_FOUND))),
            @ApiResponse(responseCode = "409", description = "Otra persona del hogar modificó el artículo entre tu lectura y tu escritura.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "colision", value = EXAMPLE_OPTIMISTIC_LOCK)))
    })
    @PatchMapping(path = "/{itemId}",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public PantryItemResponse update(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Identificador del artículo.",
                    example = "7a1c4e93-6d05-4b28-91f7-0c3a8d5e2b46")
            @PathVariable UUID itemId,
            @Valid @RequestBody UpdatePantryItemRequest request) {
        return pantry.update(householdId, itemId, request);
    }

    @Operation(
            summary = "Gastar producto",
            description = """
                    Resta de lo que hay y registra un movimiento `CONSUMPTION`.

                    **La cantidad nunca queda en negativo.** Gastar tres litros cuando quedaba
                    uno deja el artículo en cero y registra que se gastó uno, que es lo único
                    que había: registrar los tres haría que la suma de los movimientos dejara
                    de cuadrar con la cantidad.

                    La cantidad enviada tiene que ser mayor que cero; para corregir un valor
                    está editar el artículo.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Producto gastado.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = PantryItemResponse.class),
                            examples = @ExampleObject(name = "gastadoHastaCero", value = EXAMPLE_CONSUMED))),
            @ApiResponse(responseCode = "400", description = "La cantidad falta, es cero o es negativa.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "cantidadInvalida", value = EXAMPLE_VALIDATION))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = ITEM_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "articuloAjeno", value = EXAMPLE_ITEM_NOT_FOUND))),
            @ApiResponse(responseCode = "409", description = "Otra persona del hogar modificó el artículo a la vez.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "colision", value = EXAMPLE_OPTIMISTIC_LOCK)))
    })
    @PostMapping(path = "/{itemId}:consume",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public PantryItemResponse consume(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Identificador del artículo.",
                    example = "7a1c4e93-6d05-4b28-91f7-0c3a8d5e2b46")
            @PathVariable UUID itemId,
            @Valid @RequestBody QuantityRequest request) {
        return pantry.consume(householdId, itemId, request.quantity());
    }

    @Operation(
            summary = "Reponer producto",
            description = "Suma a lo que hay y registra un movimiento `PURCHASE`.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Producto repuesto.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = PantryItemResponse.class),
                            examples = @ExampleObject(name = "repuesto", value = EXAMPLE_ITEM))),
            @ApiResponse(responseCode = "400", description = "La cantidad falta, es cero o es negativa.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "cantidadInvalida", value = EXAMPLE_VALIDATION))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = ITEM_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "articuloAjeno", value = EXAMPLE_ITEM_NOT_FOUND))),
            @ApiResponse(responseCode = "409", description = "Otra persona del hogar modificó el artículo a la vez.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "colision", value = EXAMPLE_OPTIMISTIC_LOCK)))
    })
    @PostMapping(path = "/{itemId}:restock",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public PantryItemResponse restock(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Identificador del artículo.",
                    example = "7a1c4e93-6d05-4b28-91f7-0c3a8d5e2b46")
            @PathVariable UUID itemId,
            @Valid @RequestBody QuantityRequest request) {
        return pantry.restock(householdId, itemId, request.quantity());
    }

    @Operation(
            summary = "Sacar un producto de la despensa",
            description = """
                    Elimina el artículo **y su historial de movimientos**, que se va con él.
                    El producto sigue en el catálogo: para quitarlo de ahí hay otro endpoint.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Artículo eliminado.", content = @Content),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = ITEM_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "articuloAjeno", value = EXAMPLE_ITEM_NOT_FOUND)))
    })
    @DeleteMapping(path = "/{itemId}")
    public ResponseEntity<Void> delete(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Identificador del artículo.",
                    example = "7a1c4e93-6d05-4b28-91f7-0c3a8d5e2b46")
            @PathVariable UUID itemId) {
        pantry.delete(householdId, itemId);
        return ResponseEntity.noContent().build();
    }
}
