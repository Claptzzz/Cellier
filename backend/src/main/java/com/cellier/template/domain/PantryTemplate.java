package com.cellier.template.domain;

import com.cellier.household.domain.Household;
import com.cellier.identity.domain.User;
import com.cellier.shared.audit.AuditableEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Una plantilla de despensa: lo que este hogar quiere tener en casa.
 *
 * <p>Es una lista de deseos con cantidades —«de esto quiero tener diez»—, no una compra ni un
 * estado. Es el listón contra el que se mide la despensa; de restar una cosa de la otra sale
 * el reporte de compras.
 *
 * <p>Un hogar puede tener varias: la compra semanal no se parece a la del asado.
 *
 * <p><strong>Quien la creó no manda sobre ella.</strong> {@code createdBy} es un dato, no una
 * autoridad: cualquier miembro del hogar puede editarla y borrarla. Es la misma regla que en
 * el resto del sistema —la autoría nunca decide quién puede hacer qué— y por eso la columna
 * queda en nulo si esa persona se da de baja.
 */
@Entity
@Table(name = "pantry_templates")
public class PantryTemplate extends AuditableEntity {

    @Id
    @GeneratedValue
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "household_id", nullable = false, updatable = false)
    private Household household;

    @Column(name = "name", nullable = false)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    /**
     * Los ítems viven y mueren con la plantilla, de ahí el borrado huérfano: una línea que
     * sale de la lista no es una línea archivada, es una línea que ya no existe.
     *
     * <p>El orden lo fija la consulta que los lee —el reporte tiene el suyo, que no es este—,
     * pero aquí se pide uno estable para que dos lecturas seguidas no devuelvan lo mismo en
     * distinto orden.
     */
    @OneToMany(mappedBy = "template", cascade = CascadeType.ALL, orphanRemoval = true,
            fetch = FetchType.LAZY)
    @OrderBy("id asc")
    private List<TemplateItem> items = new ArrayList<>();

    protected PantryTemplate() {
        // Requerido por JPA.
    }

    private PantryTemplate(Household household, String name, User createdBy) {
        this.household = household;
        this.name = name;
        this.createdBy = createdBy;
    }

    public static PantryTemplate create(Household household, String name, User createdBy) {
        return new PantryTemplate(household, name, createdBy);
    }

    public void rename(String name) {
        this.name = name;
    }

    /**
     * Reemplaza la lista entera.
     *
     * <p>Para quien llama es un reemplazo, no una fusión: manda la lista que quiere tener y
     * lo que no venga deja de estar. Fusionar por fuera obligaría a inventar un lenguaje de
     * altas y bajas para algo que se edita como un bloque.
     *
     * <p>Por dentro sí se reconcilia, y por dos razones. La primera es que vaciar y volver a
     * llenar no funciona: Hibernate emite los INSERT antes que los DELETE dentro de la misma
     * descarga, así que sustituir una lista por otra que comparte productos choca contra
     * {@code uq_template_items_template_product}. La segunda es que una línea cuya cantidad
     * cambia de 10 a 12 sigue siendo la misma línea, y conservar su identificador es más
     * cierto que darle uno nuevo.
     */
    public void replaceItems(List<TemplateItem> replacement) {
        Map<UUID, TemplateItem> deseados = new LinkedHashMap<>();
        replacement.forEach((item) -> deseados.put(item.getProduct().getId(), item));

        this.items.removeIf((existing) -> !deseados.containsKey(existing.getProduct().getId()));
        this.items.forEach((existing) -> {
            TemplateItem pedido = deseados.remove(existing.getProduct().getId());
            existing.want(pedido.getDesiredQuantity());
        });
        this.items.addAll(deseados.values());
    }

    public UUID getId() {
        return id;
    }

    public Household getHousehold() {
        return household;
    }

    public String getName() {
        return name;
    }

    public User getCreatedBy() {
        return createdBy;
    }

    public List<TemplateItem> getItems() {
        return items;
    }
}
