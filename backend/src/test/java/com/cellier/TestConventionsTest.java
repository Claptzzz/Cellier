package com.cellier;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Convenciones de los propios tests, comprobadas sobre su código fuente.
 *
 * <p>Va aquí y no en un script aparte para que se ejecute con {@code mvn test} sin que nadie
 * tenga que acordarse: una comprobación que hay que lanzar a mano se deja de lanzar.
 */
@DisplayName("Convenciones de los tests")
class TestConventionsTest {

    private static final Path RAIZ = Path.of("src", "test", "java");

    private static final Pattern CUERPO = Pattern.compile("\\.andExpect\\(\\s*(?:jsonPath|content)\\(");
    private static final Pattern STATUS = Pattern.compile("\\.andExpect\\(\\s*status\\(");

    /**
     * Comprobar el cuerpo de una respuesta sin haber comprobado antes su status hace que un
     * fallo se lea mal.
     *
     * <p>Pasó de verdad: un endpoint devolvía 500 y la aserción
     * {@code jsonPath("$.length()").value(1)} contó las cinco propiedades del ProblemDetail.
     * El fallo decía «esperaba 1, hubo 5» y mandó a buscar una fuga de datos entre hogares
     * que no existía. El status va primero para que un error se anuncie como lo que es.
     */
    @Test
    @DisplayName("ninguna aserción sobre el cuerpo va sin comprobar antes el status")
    void elStatusVaAntesQueElCuerpo() throws IOException {
        List<String> infracciones = new ArrayList<>();

        for (Path fichero : ficherosDeTest()) {
            String contenido = Files.readString(fichero);
            int desplazamiento = 0;

            // Cada sentencia completa. La cadena .perform(…).andExpect(…).andExpect(…)
            // termina en punto y coma, así que partir por ahí aísla una llamada entera.
            for (String sentencia : contenido.split(";")) {
                int inicio = desplazamiento;
                desplazamiento += sentencia.length() + 1;

                Matcher cuerpo = CUERPO.matcher(sentencia);
                if (!cuerpo.find()) {
                    continue;
                }
                Matcher status = STATUS.matcher(sentencia);
                boolean statusAntes = status.find() && status.start() < cuerpo.start();
                if (statusAntes) {
                    continue;
                }

                long linea = contenido.substring(0, inicio + cuerpo.start()).lines().count();
                infracciones.add(fichero + ":" + linea);
            }
        }

        assertThat(infracciones)
                .describedAs("""
                        Estas aserciones miran el cuerpo sin comprobar antes el status. Si la \
                        respuesta es un error, jsonPath leerá el ProblemDetail y el fallo \
                        señalará al sitio equivocado. Añade .andExpect(status()…) delante.""")
                .isEmpty();
    }

    private static List<Path> ficherosDeTest() throws IOException {
        try (Stream<Path> rutas = Files.walk(RAIZ)) {
            return rutas.filter((p) -> p.toString().endsWith(".java")).toList();
        }
    }
}
