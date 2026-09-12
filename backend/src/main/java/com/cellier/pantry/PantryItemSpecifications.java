package com.cellier.pantry;

import com.cellier.pantry.domain.PantryItem;
import jakarta.persistence.criteria.Join;
import org.springframework.data.jpa.domain.Specification;

import java.util.UUID;

/**
 * Los filtros del listado de despensa, como especificaciones componibles.
 *
 * <p>Se usan especificaciones y no consultas escritas a mano porque hay dos filtros
 * opcionales —texto y categoría— y tres órdenes, o sea doce variantes. Escribirlas como
 * métodos separados, que es lo que se hizo con un solo filtro opcional, aquí no escala; y
 * el atajo de {@code (:param is null or …)} no funciona: un parámetro comparado con null no
 * tiene tipo inferible. Ver {@code docs/reglas-esquema.md}, sección 6.
 */
public final class PantryItemSpecifications {

    private PantryItemSpecifications() {
    }

    /** El filtro que nunca es opcional: la despensa es siempre la de un hogar concreto. */
    public static Specification<PantryItem> inHousehold(UUID householdId) {
        return (root, query, cb) -> cb.equal(root.get("household").get("id"), householdId);
    }

    /** Texto contenido en el nombre del producto, sin distinguir mayúsculas. */
    public static Specification<PantryItem> nameContains(String search) {
        return (root, query, cb) -> {
            Join<Object, Object> product = root.join("product");
            return cb.like(cb.lower(product.get("name")), "%" + search.toLowerCase() + "%");
        };
    }

    /** Categoría exacta, sin distinguir mayúsculas: «Nevera» y «nevera» son la misma. */
    public static Specification<PantryItem> hasCategory(String category) {
        return (root, query, cb) -> {
            Join<Object, Object> product = root.join("product");
            return cb.equal(cb.lower(product.get("category")), category.toLowerCase());
        };
    }
}
