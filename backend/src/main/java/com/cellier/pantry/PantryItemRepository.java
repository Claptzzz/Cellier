package com.cellier.pantry;

import com.cellier.pantry.domain.PantryItem;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.domain.Specification;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PantryItemRepository
        extends JpaRepository<PantryItem, UUID>, JpaSpecificationExecutor<PantryItem> {

    /**
     * El listado de la despensa, con su producto ya cargado.
     *
     * <p>El grafo de entidad es lo que evita el N+1: sin él, cada fila dispararía una
     * consulta para traer el nombre y la unidad de su producto al construir la respuesta.
     * Con él, una sola sentencia trae todo. No se pagina —una despensa doméstica es corta—,
     * así que no hay consulta de recuento que el «fetch» pudiera romper.
     */
    @Override
    @EntityGraph(attributePaths = "product")
    List<PantryItem> findAll(Specification<PantryItem> spec, Sort sort);

    /**
     * El artículo dentro de ESE hogar. Emparejar los dos identificadores es lo que hace que
     * un artículo ajeno responda 404 en vez de dejarse tocar.
     */
    Optional<PantryItem> findByIdAndHouseholdId(UUID id, UUID householdId);

    /** Si ese producto ya está en la despensa del hogar. Una fila por producto. */
    Optional<PantryItem> findByHouseholdIdAndProductId(UUID householdId, UUID productId);
}
