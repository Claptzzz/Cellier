package com.cellier.shared.support;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.EntityTransaction;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Vacía la base entera, en el orden que exigen las claves foráneas, desde UN solo sitio.
 *
 * <p>Vive en {@code main} y no en {@code test} porque la tiene que poder llamar tanto un test de
 * integración de JUnit como el endpoint de reinicio de las pruebas E2E de Playwright
 * ({@code TestSupportController}, bajo el perfil {@code test}) — y ese endpoint corre dentro de
 * la aplicación real, que nunca carga el classpath de {@code test}.
 *
 * <p>Antes de esta clase, cada clase de test de integración mantenía su propia secuencia de
 * {@code deleteAll()} a mano. Ha fallado dos veces por la misma razón, en dos incrementos
 * distintos: en el 7, {@code products.deleteAll()} chocaba con {@code fk_pantry_items_product}
 * porque esa clase no sabía que la despensa ya existía; en el 9,
 * {@code AuthFlowIntegrationTest} nunca se enteró de que {@code households} había llegado en
 * el Incremento 3, y {@code users.deleteAll()} chocaba con {@code fk_households_created_by} en
 * cuanto el contexto de Spring se compartía con una clase que sí crea hogares. Las dos veces el
 * fallo apareció en una clase que no tenía nada que ver con la tabla que faltaba, y sólo al
 * correr la suite completa: exactamente el síntoma de una omisión en silencio.
 *
 * <p><strong>{@link #DELETION_ORDER} sigue siendo una lista a mano</strong> —no se calcula
 * solo a partir del grafo de claves foráneas, aunque se podría: un orden explícito es más
 * fácil de leer y de razonar que un resultado de ordenación topológica, y con trece tablas no
 * hace falta la maquinaria—. Lo que sí hace {@link #cleanAll} en cada llamada es
 * <strong>validar</strong> esa lista contra el esquema real, dos veces: que cubre todas las
 * tablas que existen de verdad ({@link #verifyCoversAllTables}), y que el orden declarado no
 * contradice ninguna clave foránea real ({@link #verifyOrderRespectsForeignKeys}). Añadir una
 * tabla y olvidar registrarla aquí, o registrarla en el sitio equivocado, revienta en esta
 * clase, nombrando la tabla, la próxima vez que cualquier llamante invoque {@link #cleanAll} —
 * no en otra clase, semanas después, con la suite completa (o la demo de E2E) como único testigo.
 */
public final class DatabaseCleaner {

    /** La gestiona Flyway, no quien llama: nunca se toca. */
    private static final String FLYWAY_TABLE = "flyway_schema_history";

    /**
     * Hijos antes que padres. Cada línea es una tabla que hay que vaciar antes que las que
     * referencia.
     */
    static final List<String> DELETION_ORDER = List.of(
            "stock_movements", "template_items", "recipe_ingredients", "recipe_steps",
            "pantry_items", "pantry_templates", "recipes",
            "products",
            "join_requests", "household_members",
            "households",
            "refresh_tokens",
            "users"
    );

    private DatabaseCleaner() {
    }

    /**
     * Borra todas las filas de todas las tablas del dominio, validando primero que
     * {@link #DELETION_ORDER} sigue describiendo el esquema real.
     */
    public static void cleanAll(EntityManagerFactory entityManagerFactory) {
        EntityManager em = entityManagerFactory.createEntityManager();
        try {
            verifyCoversAllTables(DELETION_ORDER, liveTables(em));
            verifyOrderRespectsForeignKeys(DELETION_ORDER, foreignKeys(em));

            EntityTransaction tx = em.getTransaction();
            tx.begin();
            try {
                for (String table : DELETION_ORDER) {
                    em.createNativeQuery("delete from " + table).executeUpdate();
                }
                tx.commit();
            } catch (RuntimeException ex) {
                tx.rollback();
                throw ex;
            }
        } finally {
            em.close();
        }
    }

    // ---------------------------------------------------------------------------------
    // Validación. Paquete-visible para que el test de esta clase la ejercite con listas
    // fabricadas, sin necesitar una base real para probar el caso que tiene que fallar.
    // ---------------------------------------------------------------------------------

    static void verifyCoversAllTables(List<String> order, List<String> liveTables) {
        Set<String> declaradas = new LinkedHashSet<>(order);
        List<String> sinDeclarar = liveTables.stream().filter((t) -> !declaradas.contains(t)).toList();
        if (!sinDeclarar.isEmpty()) {
            throw new IllegalStateException(
                    "DatabaseCleaner.DELETION_ORDER no conoce " + sinDeclarar
                            + ". Una migración añadió esa tabla y nadie la registró aquí: sin "
                            + "hacerlo, la limpieza deja filas sueltas que rompen otra clase de "
                            + "test, o el reinicio entre pruebas E2E, no ésta. Añádela a "
                            + "DELETION_ORDER, antes que las tablas que referencia.");
        }
    }

    static void verifyOrderRespectsForeignKeys(List<String> order, List<ForeignKey> foreignKeys) {
        Map<String, Integer> posicion = new LinkedHashMap<>();
        for (int i = 0; i < order.size(); i++) {
            posicion.put(order.get(i), i);
        }

        List<String> violaciones = new ArrayList<>();
        for (ForeignKey fk : foreignKeys) {
            Integer hijo = posicion.get(fk.child());
            Integer padre = posicion.get(fk.parent());
            // Si alguna de las dos tablas falta en DELETION_ORDER, verifyCoversAllTables ya lo
            // habrá reventado con un mensaje más concreto antes de llegar aquí.
            if (hijo != null && padre != null && hijo >= padre) {
                violaciones.add(fk.child() + " tiene que borrarse antes que " + fk.parent()
                        + " por " + fk.constraintName() + ", y en DELETION_ORDER está al revés o "
                        + "en el mismo sitio");
            }
        }
        if (!violaciones.isEmpty()) {
            throw new IllegalStateException(
                    "DatabaseCleaner.DELETION_ORDER contradice estas claves foráneas: "
                            + violaciones + ".");
        }
    }

    private static List<String> liveTables(EntityManager em) {
        List<?> filas = em.createNativeQuery("""
                select table_name from information_schema.tables
                where table_schema = 'public' and table_type = 'BASE TABLE'
                  and table_name <> '""" + FLYWAY_TABLE + "'")
                .getResultList();
        return filas.stream().map(Object::toString).toList();
    }

    private static List<ForeignKey> foreignKeys(EntityManager em) {
        List<?> filas = em.createNativeQuery("""
                select distinct tc.table_name, tc.constraint_name, ccu.table_name
                  from information_schema.table_constraints tc
                  join information_schema.constraint_column_usage ccu
                    on ccu.constraint_name = tc.constraint_name
                   and ccu.constraint_schema = tc.constraint_schema
                 where tc.constraint_type = 'FOREIGN KEY'
                   and tc.table_schema = 'public'
                """)
                .getResultList();
        return filas.stream()
                .map((fila) -> {
                    Object[] columnas = (Object[]) fila;
                    return new ForeignKey((String) columnas[0], (String) columnas[1], (String) columnas[2]);
                })
                .toList();
    }

    record ForeignKey(String child, String constraintName, String parent) {
    }
}
