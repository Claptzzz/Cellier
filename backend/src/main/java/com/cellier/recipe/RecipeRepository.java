package com.cellier.recipe;

import com.cellier.recipe.domain.Recipe;
import com.cellier.recipe.domain.RecipeIngredient;
import com.cellier.recipe.dto.RecipeIngredientRow;
import com.cellier.recipe.dto.RecipeSummaryRow;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RecipeRepository extends JpaRepository<Recipe, UUID> {

    /**
     * La receta dentro de ESE hogar. Emparejar los dos identificadores es lo que hace que una
     * receta ajena responda 404 en vez de dejarse tocar.
     */
    Optional<Recipe> findByIdAndHouseholdId(UUID id, UUID householdId);

    /**
     * Igual, pero trayéndose los pasos: es lo que pide el detalle simple —{@code GET /{id}}—,
     * que no cruza contra la despensa. Los ingredientes se piden aparte con
     * {@link #findIngredients}: Hibernate no permite traer con JOIN FETCH dos colecciones
     * {@code List} —"bags", sin columna de orden propia— del mismo padre a la vez, y
     * {@code ingredients} y {@code steps} lo son las dos.
     */
    @EntityGraph(attributePaths = "steps")
    @Query("select r from Recipe r where r.id = :id and r.household.id = :householdId")
    Optional<Recipe> findDetail(@Param("id") UUID id, @Param("householdId") UUID householdId);

    /**
     * Los ingredientes de UNA receta con su producto ya resuelto, sin cruzar contra la
     * despensa: es lo que pide el detalle simple. El cruce con disponibilidad vive en
     * {@link #ingredientsWithAvailability}, detrás de su propio endpoint.
     */
    @Query("""
            select ri from RecipeIngredient ri
            join fetch ri.product
            where ri.recipe.id = :recipeId
            order by ri.product.category asc nulls last, lower(ri.product.name) asc
            """)
    List<RecipeIngredient> findIngredients(@Param("recipeId") UUID recipeId);

    /**
     * Igual que {@link #findDetail}, pero trayéndose también los ingredientes con su producto.
     * Es lo que necesita un reemplazo para reconciliar contra lo que ya había, sin volver a
     * pedirlo aparte.
     *
     * <p>No incluye {@code steps} en el mismo grafo: Hibernate no permite traer con JOIN FETCH
     * dos colecciones {@code List} —"bags", sin columna de orden propia— a la vez, y las dos
     * listas de {@code Recipe} lo son. {@code Recipe.replaceSteps} sigue funcionando igual: al
     * tocar la colección dispara su propia consulta, sólo que no viene en este viaje.
     */
    @EntityGraph(attributePaths = {"ingredients", "ingredients.product"})
    @Query("select r from Recipe r where r.id = :id and r.household.id = :householdId")
    Optional<Recipe> findForUpdate(@Param("id") UUID id, @Param("householdId") UUID householdId);

    /**
     * La lista de recetas del hogar, con sus tres recuentos y el filtro de disponibilidad ya
     * resueltos en la base, en UNA consulta.
     *
     * <p>Contar y cruzar en Java obligaría a traer todos los ingredientes de todas las recetas
     * junto con la despensa entera para descartar casi todo después: el recuento es lo único
     * que la lista necesita.
     *
     * <p>El cruce con {@code PantryItem} va por producto <strong>y por hogar</strong>, igual
     * que en el reporte de plantillas: el hogar ya lo garantiza la clave foránea compuesta,
     * pero repetirlo aquí hace que la consulta siga siendo correcta leída sola. El par (hogar,
     * producto) es único en la despensa, así que el cruce no multiplica filas.
     *
     * <p>{@code filter} es un texto —{@code ALL}, {@code READY} o {@code MISSING}— y nunca
     * llega nulo: el servicio siempre manda uno. Lo mismo {@code search}: cadena vacía cuando
     * no se busca nada, nunca {@code null}. No es el caso de «un parámetro comparado con null»
     * de docs/reglas-esquema.md —esa trampa es específica de comparar con {@code null}—, porque
     * aquí los dos parámetros siempre se comparan con literales, nunca con {@code null}.
     */
    @Query("""
            select new com.cellier.recipe.dto.RecipeSummaryRow(
                r.id, r.name,
                count(ri.id),
                count(case when ri.optional = false then ri.id end),
                count(case when ri.optional = false and coalesce(pi.quantity, 0) < ri.quantity then ri.id end),
                autor.displayName, r.createdAt, r.updatedAt)
            from Recipe r
            left join r.ingredients ri
            left join ri.product p
            left join PantryItem pi
                on pi.product.id = p.id and pi.household.id = :householdId
            left join r.createdBy autor
            where r.household.id = :householdId
              and (:search = '' or lower(r.name) like lower(concat('%', :search, '%')))
            group by r.id, r.name, autor.displayName, r.createdAt, r.updatedAt
            having :filter = 'ALL'
                or (:filter = 'READY'
                    and count(case when ri.optional = false then ri.id end) > 0
                    and count(case when ri.optional = false and coalesce(pi.quantity, 0) < ri.quantity then ri.id end) = 0)
                or (:filter = 'MISSING'
                    and (count(case when ri.optional = false then ri.id end) = 0
                         or count(case when ri.optional = false and coalesce(pi.quantity, 0) < ri.quantity then ri.id end) > 0))
            order by lower(r.name) asc, r.id asc
            """)
    List<RecipeSummaryRow> findAllOf(@Param("householdId") UUID householdId, @Param("filter") String filter,
                                     @Param("search") String search);

    /**
     * El cruce de los ingredientes de UNA receta contra la despensa, en UNA consulta. Igual
     * forma que {@code PantryTemplateRepository.reportOf}, pero por receta y sin descartar
     * nada: el detalle enseña todas las líneas, cubiertas o no.
     */
    @Query("""
            select new com.cellier.recipe.dto.RecipeIngredientRow(
                ri.id, p.id, p.name, p.unit, p.category, ri.quantity, ri.optional,
                coalesce(pi.quantity, 0))
            from RecipeIngredient ri
            join ri.product p
            left join PantryItem pi
                on pi.product.id = p.id and pi.household.id = :householdId
            where ri.recipe.id = :recipeId
            order by p.category asc nulls last, lower(p.name) asc
            """)
    List<RecipeIngredientRow> ingredientsWithAvailability(@Param("recipeId") UUID recipeId,
                                                           @Param("householdId") UUID householdId);
}
