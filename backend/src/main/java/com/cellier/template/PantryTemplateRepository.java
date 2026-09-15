package com.cellier.template;

import com.cellier.template.domain.PantryTemplate;
import com.cellier.template.dto.TemplateReportRow;
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

    /**
     * El cruce de la plantilla contra la despensa, en UNA consulta.
     *
     * <p>Es un {@code left join}: un producto que la plantilla quiere y que no está en la
     * despensa tiene que salir igual, con cero. Con un join normal desaparecería, y
     * desaparecer de la lista de la compra es exactamente lo contrario de lo que significa
     * no tenerlo.
     *
     * <p>El cruce con {@code PantryItem} va por producto <strong>y por hogar</strong>. El
     * hogar ya lo garantiza la clave foránea compuesta, pero repetirlo aquí hace que la
     * consulta siga siendo correcta leída sola, sin apoyarse en una garantía que vive en otro
     * archivo. Y el par (hogar, producto) es único en la despensa, así que el cruce no puede
     * multiplicar filas.
     *
     * <p>El orden lo pone la base porque es parte del resultado: primero lo que falta
     * —agrupado por categoría, que es como se recorre un súper— y después lo cubierto. El
     * tercer criterio, el nombre, existe para que dos ejecuciones seguidas no bailen: sin él,
     * dos productos de la misma categoría salen en el orden que quiera el plan de ejecución y
     * la lista se reordena sola al recargar.
     */
    @Query("""
            select new com.cellier.template.dto.TemplateReportRow(
                p.id, p.name, p.unit, p.category,
                ti.desiredQuantity,
                coalesce(pi.quantity, 0))
            from TemplateItem ti
            join ti.product p
            left join PantryItem pi
                on pi.product.id = p.id and pi.household.id = :householdId
            where ti.template.id = :templateId
            order by
                case when coalesce(pi.quantity, 0) >= ti.desiredQuantity then 1 else 0 end asc,
                p.category asc nulls last,
                lower(p.name) asc
            """)
    List<TemplateReportRow> reportOf(@Param("templateId") UUID templateId,
                                     @Param("householdId") UUID householdId);
}
