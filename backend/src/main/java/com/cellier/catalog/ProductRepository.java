package com.cellier.catalog;

import com.cellier.catalog.domain.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProductRepository extends JpaRepository<Product, UUID> {

    /**
     * El producto dentro de ESE hogar. Emparejar los dos identificadores es lo que hace que
     * un producto ajeno responda 404 en vez de dejarse tocar: sin el household_id, bastaría
     * con conocer un id.
     */
    Optional<Product> findByIdAndHouseholdId(UUID id, UUID householdId);

    /**
     * Busca por nombre sin distinguir mayúsculas, que es como está definida la unicidad.
     * Es la consulta que decide si un alta reutiliza un producto o crea uno nuevo.
     */
    @Query("""
            select p from Product p
             where p.household.id = :householdId
               and lower(p.name) = lower(:name)
            """)
    Optional<Product> findByHouseholdIdAndNameIgnoreCase(@Param("householdId") UUID householdId,
                                                          @Param("name") String name);

    /**
     * El catálogo completo del hogar. El orden es por nombre, con el identificador de
     * desempate para que dos productos homónimos no bailen entre llamadas.
     */
    @Query("""
            select new com.cellier.catalog.dto.ProductResponse(p.id, p.name, p.unit, p.category)
              from Product p
             where p.household.id = :householdId
             order by p.name asc, p.id asc
            """)
    List<com.cellier.catalog.dto.ProductResponse> findAllOf(@Param("householdId") UUID householdId);

    /**
     * El catálogo filtrado por un texto del nombre, sin distinguir mayúsculas.
     *
     * <p>Va en un método aparte y no en un {@code (:search is null or …)} por el mismo
     * motivo que la bandeja de solicitudes: un parámetro comparado con null no tiene tipo
     * que Hibernate pueda inferir, lo manda como {@code bytea} y PostgreSQL responde
     * «function lower(bytea) does not exist». Dos consultas legibles valen más que una con
     * anotaciones de tipado.
     */
    @Query("""
            select new com.cellier.catalog.dto.ProductResponse(p.id, p.name, p.unit, p.category)
              from Product p
             where p.household.id = :householdId
               and lower(p.name) like lower(concat('%', :search, '%'))
             order by p.name asc, p.id asc
            """)
    List<com.cellier.catalog.dto.ProductResponse> findMatching(@Param("householdId") UUID householdId,
                                                               @Param("search") String search);

    /**
     * Cuántos artículos de despensa usan este producto.
     *
     * <p>Consulta nativa porque la despensa todavía no tiene entidad: llega en el cambio
     * siguiente. Sirve para dar un mensaje concreto al rechazar el borrado; la garantía de
     * que no se borre un producto en uso la da la clave foránea, no esta cuenta.
     */
    @Query(value = "select count(*) from pantry_items where product_id = :productId", nativeQuery = true)
    long countPantryUsages(@Param("productId") UUID productId);
}
