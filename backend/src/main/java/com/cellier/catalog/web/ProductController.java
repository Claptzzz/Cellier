package com.cellier.catalog.web;

import com.cellier.catalog.ProductService;
import com.cellier.catalog.dto.CreateProductRequest;
import com.cellier.catalog.dto.ProductResponse;
import com.cellier.catalog.dto.UpdateProductRequest;
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
@RequestMapping("/api/v1/households/{householdId}/products")
@Tag(name = "Products", description = """
        El catálogo de productos de un hogar: qué cosas existen y en qué unidad se miden.

        **Cada producto define una unidad canónica y no hay conversión entre unidades.** Todas
        las cantidades del sistema —despensa, plantillas, recetas— se expresan en la unidad de
        su producto, de modo que comparar lo que hay con lo que hace falta es una resta.

        Es una restricción deliberada: los factores de conversión dependen del producto (un
        kilo de harina no ocupa lo mismo que un kilo de arroz) y algunos no existen (no hay
        gramos en dos lechugas). Por eso **la unidad no se puede cambiar** una vez creado el
        producto: hacerlo reinterpretaría las cantidades ya registradas.

        El catálogo es de cada hogar. El nombre es único dentro del hogar sin distinguir
        mayúsculas: «Leche» y «leche» son el mismo producto.
        """)
@SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME)
public class ProductController {

    private static final String EXAMPLE_LIST = """
            [
              {
                "id": "4d9a1f60-2c83-4b17-9e5a-71c0d6f2a3b8",
                "name": "Huevos",
                "unit": "UNIT",
                "category": "Nevera"
              },
              {
                "id": "9b2e7c04-5a16-4f83-a0d7-3e8b1c5f9204",
                "name": "Lechuga",
                "unit": "UNIT",
                "category": "Nevera"
              },
              {
                "id": "c15f8d32-7b40-4e29-8c61-a4d09e7b2f53",
                "name": "Salsa de tomate",
                "unit": "ML",
                "category": "Despensa"
              }
            ]""";

    private static final String EXAMPLE_PRODUCT = """
            {
              "id": "c15f8d32-7b40-4e29-8c61-a4d09e7b2f53",
              "name": "Salsa de tomate",
              "unit": "ML",
              "category": "Despensa"
            }""";

    private static final String EXAMPLE_UNAUTHORIZED = """
            {
              "type": "https://cellier.app/problems/unauthorized",
              "title": "No autenticado",
              "status": 401,
              "detail": "Se requiere un access token válido.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/products"
            }""";

    private static final String EXAMPLE_HOUSEHOLD_NOT_FOUND = """
            {
              "type": "https://cellier.app/problems/not-found",
              "title": "Recurso no encontrado",
              "status": 404,
              "detail": "No existe ese hogar, o no eres miembro de él.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/products"
            }""";

    private static final String EXAMPLE_PRODUCT_NOT_FOUND = """
            {
              "type": "https://cellier.app/problems/not-found",
              "title": "Recurso no encontrado",
              "status": 404,
              "detail": "No existe ese producto en este hogar.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/products/c15f8d32-7b40-4e29-8c61-a4d09e7b2f53"
            }""";

    private static final String EXAMPLE_DUPLICATE = """
            {
              "type": "https://cellier.app/problems/conflict",
              "title": "Conflicto con el estado actual",
              "status": 409,
              "detail": "Ya existe «Salsa de tomate» en este hogar, medido en ML. Usa ese producto, o elige otro nombre para «salsa de tomate».",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/products"
            }""";

    private static final String EXAMPLE_IN_USE = """
            {
              "type": "https://cellier.app/problems/conflict",
              "title": "Conflicto con el estado actual",
              "status": 409,
              "detail": "No se puede eliminar «Huevos»: está en la despensa. Quítalo de la despensa primero.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/products/4d9a1f60-2c83-4b17-9e5a-71c0d6f2a3b8"
            }""";

    private static final String EXAMPLE_VALIDATION = """
            {
              "type": "https://cellier.app/problems/bad-request",
              "title": "Datos inválidos",
              "status": 400,
              "detail": "Uno o más campos del cuerpo de la petición no son válidos.",
              "instance": "/api/v1/households/8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98/products",
              "errors": { "unit": "La unidad es obligatoria" }
            }""";

    private static final String HOUSEHOLD_NOT_FOUND_DESCRIPTION =
            "El hogar no existe, o existe pero el usuario autenticado no es miembro. "
                    + "La API no distingue ambos casos a propósito.";

    private final ProductService products;

    public ProductController(ProductService products) {
        this.products = products;
    }

    @Operation(
            summary = "Listar el catálogo",
            description = """
                    Los productos del hogar, ordenados por nombre. Con `search` se filtra por
                    los que contengan ese texto en el nombre, sin distinguir mayúsculas.

                    No se pagina: el catálogo de una casa es corto y crece despacio.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Catálogo del hogar. Lista vacía si aún no hay productos.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            array = @ArraySchema(schema = @Schema(implementation = ProductResponse.class)),
                            examples = @ExampleObject(name = "catalogo", value = EXAMPLE_LIST))),
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
    public List<ProductResponse> search(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Filtra por nombre. Sin distinguir mayúsculas.", example = "tomate")
            @RequestParam(required = false) String search) {
        return products.search(householdId, search);
    }

    @Operation(
            summary = "Añadir un producto al catálogo",
            description = """
                    Crea un producto con su unidad canónica.

                    Responde `409` si ya existe uno con ese nombre en el hogar, **sin
                    distinguir mayúsculas**. El mensaje dice en qué unidad está el que ya
                    existe, que es lo que hace falta para decidir: usar ese, o elegir otro
                    nombre.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Producto creado.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = ProductResponse.class),
                            examples = @ExampleObject(name = "creado", value = EXAMPLE_PRODUCT))),
            @ApiResponse(responseCode = "400", description = "Falta el nombre o la unidad, o no son válidos.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "faltaUnidad", value = EXAMPLE_VALIDATION))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = HOUSEHOLD_NOT_FOUND_DESCRIPTION,
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "hogarAjeno", value = EXAMPLE_HOUSEHOLD_NOT_FOUND))),
            @ApiResponse(responseCode = "409", description = "Ya hay un producto con ese nombre en el hogar.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "nombreOcupado", value = EXAMPLE_DUPLICATE)))
    })
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ProductResponse> create(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Valid @RequestBody CreateProductRequest request) {
        ProductResponse created = products.create(householdId, request);
        return ResponseEntity
                .created(URI.create("/api/v1/households/" + householdId + "/products/" + created.id()))
                .body(created);
    }

    @Operation(
            summary = "Editar un producto",
            description = """
                    Cambia el nombre o la categoría. Los campos que no se envíen se dejan
                    intactos; una categoría vacía la quita.

                    **La unidad no se puede cambiar.** Hacerlo reinterpretaría todas las
                    cantidades ya registradas de ese producto: un 2 pasaría de dos litros a
                    dos gramos sin que nada en la despensa se viera distinto. Quien se
                    equivocó de unidad crea otro producto.

                    Renombrar a un nombre ya ocupado responde `409`, igual que crearlo.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Producto actualizado.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = ProductResponse.class),
                            examples = @ExampleObject(name = "actualizado", value = EXAMPLE_PRODUCT))),
            @ApiResponse(responseCode = "400", description = "Algún campo enviado no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = "El hogar no es accesible, o el producto no es de este hogar.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "productoAjeno", value = EXAMPLE_PRODUCT_NOT_FOUND))),
            @ApiResponse(responseCode = "409", description = "El nombre nuevo ya lo usa otro producto del hogar.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "nombreOcupado", value = EXAMPLE_DUPLICATE)))
    })
    @PatchMapping(path = "/{productId}",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ProductResponse update(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Identificador del producto.",
                    example = "c15f8d32-7b40-4e29-8c61-a4d09e7b2f53")
            @PathVariable UUID productId,
            @Valid @RequestBody UpdateProductRequest request) {
        return products.update(householdId, productId, request);
    }

    @Operation(
            summary = "Eliminar un producto",
            description = """
                    Sólo si no está en uso. Un producto que está en la despensa —y, cuando
                    existan, en una plantilla o en una receta— responde `409`: borrarlo
                    dejaría cantidades apuntando a algo que ya no existe.

                    El mensaje dice dónde se está usando, para que la salida sea evidente.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Producto eliminado.", content = @Content),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED))),
            @ApiResponse(responseCode = "404", description = "El hogar no es accesible, o el producto no es de este hogar.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "productoAjeno", value = EXAMPLE_PRODUCT_NOT_FOUND))),
            @ApiResponse(responseCode = "409", description = "El producto está en uso.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "enUso", value = EXAMPLE_IN_USE)))
    })
    @DeleteMapping(path = "/{productId}")
    public ResponseEntity<Void> delete(
            @Parameter(description = "Identificador del hogar.",
                    example = "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98")
            @PathVariable UUID householdId,
            @Parameter(description = "Identificador del producto.",
                    example = "4d9a1f60-2c83-4b17-9e5a-71c0d6f2a3b8")
            @PathVariable UUID productId) {
        products.delete(householdId, productId);
        return ResponseEntity.noContent().build();
    }
}
