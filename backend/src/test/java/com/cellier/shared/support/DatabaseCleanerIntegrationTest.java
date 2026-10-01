package com.cellier.shared.support;

import com.cellier.PostgresTestcontainerConfig;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.EntityTransaction;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * {@link DatabaseCleaner} contra un Postgres real.
 *
 * <p>Dos cosas que las listas fabricadas de {@link DatabaseCleanerTest} no pueden probar: que
 * {@code DELETION_ORDER} de verdad vacía el esquema de las migraciones actuales sin reventar, y
 * que una tabla nueva de verdad —creada aquí mismo, sin tocar ninguna migración— hace que la
 * limpieza reviente nombrándola en vez de dejarla con filas sueltas.
 */
@SpringBootTest
@Import(PostgresTestcontainerConfig.class)
@DisplayName("DatabaseCleaner contra la base real")
class DatabaseCleanerIntegrationTest {

    private static final String FAKE_TABLE = "cellier_test_fake_table";

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @AfterEach
    void tearDown() {
        // Si un test se cae a mitad de camino, la tabla ficticia no puede sobrevivirlo: toda
        // clase que corra después en el mismo contenedor compartido reventaría por su culpa,
        // y no por la suya propia.
        execute("drop table if exists " + FAKE_TABLE);
    }

    @Test
    @DisplayName("DELETION_ORDER cubre el esquema real y lo deja vacío")
    void limpiaLaBaseReal() {
        crearFilaMinima();

        DatabaseCleaner.cleanAll(entityManagerFactory);

        EntityManager em = entityManagerFactory.createEntityManager();
        try {
            for (String table : DatabaseCleaner.DELETION_ORDER) {
                long filas = ((Number) em.createNativeQuery("select count(*) from " + table)
                        .getSingleResult()).longValue();
                assertThat(filas).describedAs("la tabla %s debería quedar vacía", table).isZero();
            }
        } finally {
            em.close();
        }
    }

    /**
     * La prueba que de verdad importa: sin esta clase, una tabla nueva se cuela en silencio y
     * el fallo aparece en otra clase, semanas después. Con ella, revienta aquí mismo, nombrando
     * la tabla, antes de borrar una sola fila.
     */
    @Test
    @DisplayName("una tabla nueva con clave foránea que nadie registró revienta, nombrándola")
    void tablaFicticiaNoRegistradaRevienta() {
        execute("""
                create table %s (
                    id uuid primary key default gen_random_uuid(),
                    household_id uuid references households (id)
                )
                """.formatted(FAKE_TABLE));

        assertThatThrownBy(() -> DatabaseCleaner.cleanAll(entityManagerFactory))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(FAKE_TABLE);
    }

    /** Al menos una fila de verdad, para que "queda vacía" compruebe algo y no un vacío trivial. */
    private void crearFilaMinima() {
        execute("""
                insert into users (id, google_sub, email, display_name)
                values (gen_random_uuid(), 'sub-limpieza', 'limpieza@example.com', 'Quien limpia')
                """);
    }

    private void execute(String sql) {
        EntityManager em = entityManagerFactory.createEntityManager();
        try {
            EntityTransaction tx = em.getTransaction();
            tx.begin();
            em.createNativeQuery(sql).executeUpdate();
            tx.commit();
        } finally {
            em.close();
        }
    }
}
