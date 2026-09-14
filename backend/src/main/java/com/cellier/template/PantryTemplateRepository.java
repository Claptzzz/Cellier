package com.cellier.template;

import com.cellier.template.domain.PantryTemplate;
import com.cellier.template.dto.TemplateSummaryResponse;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PantryTemplateRepository extends JpaRepository<PantryTemplate, UUID> {

    /**
     * La lista con el número de líneas de cada una, en UNA consulta.
     *
     * <p>Contar en Java obligaría a traer todas las líneas de todas las plantillas para
     * mirarles el tamaño y tirarlas: el recuento es lo único que la lista necesita de ellas.
     */
    @Query("""
            select new com.cellier.template.dto.TemplateSummaryResponse(
                t.id, t.name, count(i.id), t.createdAt, t.updatedAt)
            from PantryTemplate t
            left join t.items i
            where t.household.id = :householdId
            group by t.id, t.name, t.createdAt, t.updatedAt
            order by lower(t.name) asc, t.id asc
            """)
    List<TemplateSummaryResponse> findAllOf(@Param("householdId") UUID householdId);

    /**
     * La plantilla dentro de ESE hogar. Emparejar los dos identificadores es lo que hace que
     * una plantilla ajena responda 404 en vez de dejarse tocar.
     */
    Optional<PantryTemplate> findByIdAndHouseholdId(UUID id, UUID householdId);

    /** Igual, pero trayéndose las líneas y sus productos: es lo que pide el detalle. */
    @EntityGraph(attributePaths = {"items", "items.product"})
    @Query("select t from PantryTemplate t where t.id = :id and t.household.id = :householdId")
    Optional<PantryTemplate> findDetail(@Param("id") UUID id, @Param("householdId") UUID householdId);

    /** El nombre es único en el hogar sin distinguir mayúsculas. */
    Optional<PantryTemplate> findByHouseholdIdAndNameIgnoreCase(UUID householdId, String name);
}
