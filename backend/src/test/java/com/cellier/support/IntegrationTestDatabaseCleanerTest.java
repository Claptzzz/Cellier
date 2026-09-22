package com.cellier.support;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * La validación de {@link IntegrationTestDatabaseCleaner}, con listas fabricadas y sin base de
 * datos: es rápida y no necesita Testcontainers porque sólo ejercita las dos funciones puras
 * que deciden si {@code DELETION_ORDER} sigue siendo correcto.
 *
 * <p>El caso contra el esquema real —crear una tabla de verdad y comprobar que revienta— vive
 * en {@link IntegrationTestDatabaseCleanerIntegrationTest}.
 */
@DisplayName("Validación de IntegrationTestDatabaseCleaner")
class IntegrationTestDatabaseCleanerTest {

    @Nested
    @DisplayName("Cobertura de tablas")
    class Cobertura {

        @Test
        @DisplayName("una tabla que existe pero no está declarada revienta, nombrándola")
        void tablaSinDeclararSeNombra() {
            assertThatThrownBy(() -> IntegrationTestDatabaseCleaner.verifyCoversAllTables(
                    List.of("users"), List.of("users", "households")))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("households");
        }

        @Test
        @DisplayName("una lista que cubre todo lo que hay no revienta")
        void tablaCubiertaNoRevienta() {
            assertThatCode(() -> IntegrationTestDatabaseCleaner.verifyCoversAllTables(
                    List.of("households", "users"), List.of("users", "households")))
                    .doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("Orden frente a las claves foráneas")
    class Orden {

        @Test
        @DisplayName("un hijo declarado después que su padre revienta, nombrando la clave foránea")
        void ordenInvertidoSeNombra() {
            var fk = new IntegrationTestDatabaseCleaner.ForeignKey(
                    "households", "fk_households_created_by", "users");

            // A propósito al revés del correcto: households (hijo de users) va DESPUÉS.
            assertThatThrownBy(() -> IntegrationTestDatabaseCleaner.verifyOrderRespectsForeignKeys(
                    List.of("users", "households"), List.of(fk)))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("households")
                    .hasMessageContaining("users")
                    .hasMessageContaining("fk_households_created_by");
        }

        @Test
        @DisplayName("un hijo declarado antes que su padre no revienta")
        void ordenCorrectoNoRevienta() {
            var fk = new IntegrationTestDatabaseCleaner.ForeignKey(
                    "households", "fk_households_created_by", "users");

            assertThatCode(() -> IntegrationTestDatabaseCleaner.verifyOrderRespectsForeignKeys(
                    List.of("households", "users"), List.of(fk)))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("una tabla que la lista no cubre no revienta aquí: ya reventó en Cobertura")
        void tablaFueraDeLaListaSeIgnoraEnEsteChequeo() {
            var fk = new IntegrationTestDatabaseCleaner.ForeignKey(
                    "recipe_ingredients", "fk_recipe_ingredients_recipe", "recipes");

            // Ninguna de las dos tablas está en el orden: verifyOrderRespectsForeignKeys no es
            // quien tiene que quejarse de eso, es verifyCoversAllTables.
            assertThatCode(() -> IntegrationTestDatabaseCleaner.verifyOrderRespectsForeignKeys(
                    List.of("households", "users"), List.of(fk)))
                    .doesNotThrowAnyException();
        }
    }
}
