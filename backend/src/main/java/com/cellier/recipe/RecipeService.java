package com.cellier.recipe;

import com.cellier.catalog.ProductRepository;
import com.cellier.catalog.domain.Product;
import com.cellier.household.HouseholdAccessService;
import com.cellier.household.domain.Household;
import com.cellier.identity.CurrentUserService;
import com.cellier.identity.domain.User;
import com.cellier.recipe.domain.Recipe;
import com.cellier.recipe.domain.RecipeIngredient;
import com.cellier.recipe.dto.CreateRecipeRequest;
import com.cellier.recipe.dto.RecipeAvailability;
import com.cellier.recipe.dto.RecipeAvailabilityFilter;
import com.cellier.recipe.dto.RecipeAvailabilityResponse;
import com.cellier.recipe.dto.RecipeIngredientAvailabilityResponse;
import com.cellier.recipe.dto.RecipeIngredientRequest;
import com.cellier.recipe.dto.RecipeIngredientResponse;
import com.cellier.recipe.dto.RecipeIngredientRow;
import com.cellier.recipe.dto.RecipeResponse;
import com.cellier.recipe.dto.RecipeStepResponse;
import com.cellier.recipe.dto.RecipeSummaryResponse;
import com.cellier.recipe.dto.RecipeSummaryRow;
import com.cellier.recipe.dto.UpdateRecipeRequest;
import com.cellier.shared.error.BadRequestException;
import com.cellier.shared.error.ConflictException;
import com.cellier.shared.error.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Las recetas de un hogar: qué hace falta y cómo se hace.
 *
 * <p><strong>No es una acción de administrador.</strong> Cualquier miembro crea, edita y
 * borra recetas: son del recetario de la casa, no de quien las escribió. Igual que las
 * plantillas, aquí sólo se comprueba membresía, nunca rol.
 *
 * <p>El detalle simple —{@link #get}— y la disponibilidad —{@link #availability}— son dos
 * casos de uso separados, igual que en las plantillas el detalle y el reporte: el primero es
 * lo que se edita, el segundo es lo que se calcula. Fusionarlos habría hecho pagar el cruce
 * contra la despensa a quien sólo abre la receta para verla o cambiarle el nombre.
 */
@Service
public class RecipeService {

    static final String RECIPE_NOT_FOUND = "No existe esa receta en este hogar.";

    /** Tres decimales, los mismos que la despensa y las plantillas. */
    private static final int QUANTITY_SCALE = 3;

    private final RecipeRepository recipes;
    private final ProductRepository products;
    private final HouseholdAccessService access;
    private final CurrentUserService currentUserService;
    private final Clock clock;

    public RecipeService(RecipeRepository recipes,
                         ProductRepository products,
                         HouseholdAccessService access,
                         CurrentUserService currentUserService,
                         Clock clock) {
        this.recipes = recipes;
        this.products = products;
        this.access = access;
        this.currentUserService = currentUserService;
        this.clock = clock;
    }

    /**
     * @param search texto libre, o {@code null}/blanco para no filtrar por nombre; se
     *               normaliza a cadena vacía antes de llegar al repositorio (ver
     *               {@link RecipeRepository#findAllOf})
     */
    @Transactional(readOnly = true)
    public List<RecipeSummaryResponse> list(UUID householdId, RecipeAvailabilityFilter filter, String search) {
        access.requireMember(currentUserId(), householdId);
        String filtro = (filter == null ? RecipeAvailabilityFilter.ALL : filter).name();
        String texto = search == null ? "" : search.trim();
        return recipes.findAllOf(householdId, filtro, texto).stream().map(RecipeService::toSummary).toList();
    }

    @Transactional(readOnly = true)
    public RecipeResponse get(UUID householdId, UUID recipeId) {
        access.requireMember(currentUserId(), householdId);
        Recipe recipe = requireDetail(householdId, recipeId);
        List<RecipeIngredient> ingredients = recipes.findIngredients(recipeId);
        return toResponse(recipe, ingredients);
    }

    /** La receta cruzada contra la despensa: si se puede cocinar ahora mismo, y por qué no. */
    @Transactional(readOnly = true)
    public RecipeAvailabilityResponse availability(UUID householdId, UUID recipeId) {
        access.requireMember(currentUserId(), householdId);
        Recipe recipe = requireRecipe(householdId, recipeId);
        List<RecipeIngredientRow> rows = recipes.ingredientsWithAvailability(recipeId, householdId);
        return toAvailabilityResponse(recipe, rows);
    }

    @Transactional
    public RecipeResponse create(UUID householdId, CreateRecipeRequest request) {
        User actor = currentUserService.requireCurrentUser();
        Household household = access.requireMember(actor.getId(), householdId).getHousehold();

        Recipe recipe = Recipe.create(household, request.name().trim(), blankToNull(request.description()),
                request.servings(), request.prepMinutes(), actor);
        recipe.replaceIngredients(resolveIngredients(household, recipe, request.ingredients()));
        recipe.replaceSteps(normalizeSteps(request.steps()));
        recipes.save(recipe);

        return toResponse(recipe, recipe.getIngredients());
    }

    /**
     * Reemplazo completo, no fusión: nombre, descripción, raciones, minutos, ingredientes y
     * pasos a la vez, tal como llegan. Lo que no venga en {@code ingredients} o en
     * {@code steps} deja de estar en la receta.
     */
    @Transactional
    public RecipeResponse update(UUID householdId, UUID recipeId, UpdateRecipeRequest request) {
        access.requireMember(currentUserId(), householdId);
        Recipe recipe = requireForUpdate(householdId, recipeId);

        recipe.updateDetails(request.name().trim(), blankToNull(request.description()),
                request.servings(), request.prepMinutes());
        recipe.replaceIngredients(resolveIngredients(recipe.getHousehold(), recipe, request.ingredients()));
        recipe.replaceSteps(normalizeSteps(request.steps()));

        return toResponse(recipe, recipe.getIngredients());
    }

    @Transactional
    public void delete(UUID householdId, UUID recipeId) {
        access.requireMember(currentUserId(), householdId);
        recipes.delete(requireRecipe(householdId, recipeId));
    }

    // ---------------------------------------------------------------------------------

    /**
     * Convierte las líneas pedidas en ingredientes de verdad.
     *
     * <p>Cada línea se resuelve por separado, igual que el alta de despensa: con
     * {@code productId} tiene que ser ya del catálogo de este hogar; con {@code productName} y
     * {@code unit} se reutiliza el producto que ya exista con ese nombre, o se crea. No hay un
     * pase de validación en bloque antes de escribir como en las plantillas —aquí crear un
     * producto nuevo es parte de resolver la línea, no algo que se pueda separar de escribir—,
     * pero la atomicidad no se pierde: todo vive en la misma transacción, así que una línea
     * repetida al final deshace también los productos que se hubieran creado antes.
     */
    private List<RecipeIngredient> resolveIngredients(Household household,
                                                       Recipe recipe,
                                                       List<RecipeIngredientRequest> requested) {
        if (requested == null || requested.isEmpty()) {
            return List.of();
        }

        List<RecipeIngredient> resolved = new ArrayList<>();
        Set<UUID> vistos = new LinkedHashSet<>();
        List<String> repetidos = new ArrayList<>();

        for (RecipeIngredientRequest item : requested) {
            Product product = resolveProduct(household, item);
            if (!vistos.add(product.getId())) {
                repetidos.add(product.getName());
            }
            resolved.add(RecipeIngredient.of(recipe, product, item.quantity(), item.optional()));
        }

        if (!repetidos.isEmpty()) {
            // El mismo producto dos veces son dos líneas sobre lo mismo, y la comprobación de
            // disponibilidad tendría que decidir cuál cuenta.
            throw new BadRequestException(
                    "Hay ingredientes repetidos en la lista. Cada producto puede aparecer una sola vez: "
                            + String.join(", ", repetidos) + ".");
        }

        return resolved;
    }

    /**
     * Resuelve el producto de una línea: el que se indica por id, el que ya existe con ese
     * nombre, o uno nuevo. Misma lógica que {@code PantryService.resolveProduct}, que ya
     * anotaba que su reutilización se propagaría a la disponibilidad de recetas.
     */
    private Product resolveProduct(Household household, RecipeIngredientRequest item) {
        UUID householdId = household.getId();

        if (item.productId() != null) {
            return products.findByIdAndHouseholdId(item.productId(), householdId)
                    .orElseThrow(() -> new BadRequestException(
                            "El ingrediente " + item.productId() + " no es del catálogo de este hogar."));
        }

        String name = item.productName() == null ? "" : item.productName().trim();
        if (name.isEmpty() || item.unit() == null) {
            throw new ConflictException(
                    "Indica productId, o bien productName y unit para crear el producto.");
        }

        return products.findByHouseholdIdAndNameIgnoreCase(householdId, name)
                .map((existing) -> reuse(existing, item))
                .orElseGet(() -> products.save(Product.create(household, name, item.unit(), null)));
    }

    /**
     * Reutiliza el producto que ya existe con ese nombre… salvo que la unidad no cuadre. Sin
     * conversión de unidades, la unidad es parte de la identidad del producto: reutilizarlo en
     * silencio guardaría una cantidad falsa que se propagaría a la disponibilidad de la receta.
     */
    private static Product reuse(Product existing, RecipeIngredientRequest item) {
        if (existing.getUnit() != item.unit()) {
            throw new ConflictException(
                    "«" + existing.getName() + "» ya existe en este hogar medido en "
                            + existing.getUnit() + ", y lo estás enviando en " + item.unit()
                            + ". Usa " + existing.getUnit()
                            + ", o crea un producto con otro nombre.");
        }
        return existing;
    }

    private static List<String> normalizeSteps(List<String> steps) {
        if (steps == null || steps.isEmpty()) {
            return List.of();
        }
        return steps.stream().map(String::trim).toList();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private Recipe requireRecipe(UUID householdId, UUID recipeId) {
        return recipes.findByIdAndHouseholdId(recipeId, householdId)
                .orElseThrow(() -> new NotFoundException(RECIPE_NOT_FOUND));
    }

    private Recipe requireDetail(UUID householdId, UUID recipeId) {
        return recipes.findDetail(recipeId, householdId)
                .orElseThrow(() -> new NotFoundException(RECIPE_NOT_FOUND));
    }

    private Recipe requireForUpdate(UUID householdId, UUID recipeId) {
        return recipes.findForUpdate(recipeId, householdId)
                .orElseThrow(() -> new NotFoundException(RECIPE_NOT_FOUND));
    }

    private UUID currentUserId() {
        return currentUserService.requireCurrentUser().getId();
    }

    private static RecipeSummaryResponse toSummary(RecipeSummaryRow row) {
        RecipeAvailability availability = availabilityOf(row.requiredCount(), row.missingCount());
        return new RecipeSummaryResponse(
                row.id(), row.name(), row.ingredientCount(), (int) row.missingCount(),
                availability, row.createdByName(), row.createdAt(), row.updatedAt());
    }

    private static RecipeResponse toResponse(Recipe recipe, List<RecipeIngredient> ingredients) {
        List<RecipeIngredientResponse> ingredientResponses = ingredients.stream()
                .map(RecipeService::toIngredientResponse)
                .toList();

        List<RecipeStepResponse> steps = recipe.getSteps().stream()
                .map((step) -> new RecipeStepResponse(step.getPosition(), step.getInstruction()))
                .toList();

        User author = recipe.getCreatedBy();
        return new RecipeResponse(
                recipe.getId(),
                recipe.getName(),
                recipe.getDescription(),
                recipe.getServings(),
                recipe.getPrepMinutes(),
                author == null ? null : author.getDisplayName(),
                recipe.getCreatedAt(),
                recipe.getUpdatedAt(),
                ingredientResponses,
                steps);
    }

    private static RecipeIngredientResponse toIngredientResponse(RecipeIngredient ingredient) {
        Product product = ingredient.getProduct();
        return new RecipeIngredientResponse(
                ingredient.getId(), product.getId(), product.getName(), product.getUnit(),
                product.getCategory(), ingredient.getQuantity(), ingredient.isOptional());
    }

    private RecipeAvailabilityResponse toAvailabilityResponse(Recipe recipe, List<RecipeIngredientRow> rows) {
        List<RecipeIngredientAvailabilityResponse> items = rows.stream()
                .map(RecipeService::toAvailabilityItem)
                .toList();

        long requiredCount = rows.stream().filter((row) -> !row.optional()).count();
        long missingCount = rows.stream()
                .filter((row) -> !row.optional() && row.availableQuantity().compareTo(row.quantity()) < 0)
                .count();
        RecipeAvailability availability = availabilityOf(requiredCount, missingCount);

        return new RecipeAvailabilityResponse(
                recipe.getId(), recipe.getName(), clock.instant(), availability, (int) missingCount, items);
    }

    private static RecipeIngredientAvailabilityResponse toAvailabilityItem(RecipeIngredientRow row) {
        BigDecimal available = scaled(row.availableQuantity());
        BigDecimal missing = scaled(row.quantity().subtract(available).max(BigDecimal.ZERO));
        boolean sufficient = available.compareTo(row.quantity()) >= 0;
        return new RecipeIngredientAvailabilityResponse(
                row.productId(), row.productName(), row.unit(), row.category(),
                row.quantity(), available, missing, row.optional(), sufficient);
    }

    /**
     * Vale READY sólo si hay al menos un ingrediente no opcional y todos se cumplen. Una
     * receta sin ninguno —cero líneas, o todas opcionales— no tiene nada que comprobar
     * todavía, y eso no es lo mismo que estar lista: mismo hueco que P4 en las plantillas,
     * aplicado aquí. Ver docs/reglas-recetas.md.
     */
    private static RecipeAvailability availabilityOf(long requiredCount, long missingCount) {
        return requiredCount > 0 && missingCount == 0 ? RecipeAvailability.READY : RecipeAvailability.MISSING;
    }

    private static BigDecimal scaled(BigDecimal value) {
        return value.setScale(QUANTITY_SCALE, RoundingMode.HALF_UP);
    }
}
