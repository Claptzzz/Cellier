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
     * Un literal de texto, de las dos formas: {@code "..."} o {@code """...."""}. Hace falta
     * reconocerlos antes de partir por {@code ;} porque un valor como
     * {@code "attachment; filename=\"x.json\""} —un `Content-Disposition` real, no uno de
     * mentira— lleva un punto y coma dentro de las comillas. Partir ahí corta la sentencia en
     * dos, deja el {@code status()} en el trozo de antes y el {@code jsonPath} en el de
     * después, y esta prueba reporta una violación que no existe. Pasó de verdad con el
     * `Content-Disposition` de la exportación de datos del Incremento 11.
     */
    private static final Pattern TEXT_BLOCK = Pattern.compile("\"\"\"[\\s\\S]*?\"\"\"");
    private static final Pattern STRING_LITERAL = Pattern.compile("\"(?:\\\\.|[^\"\\\\\n])*\"");

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
            // Los desplazamientos y los números de línea se calculan sobre ESTE contenido
            // enmascarado, no sobre el original: enmascarar() conserva longitud y saltos de
            // línea carácter a carácter, así que ambos coinciden siempre.
            String paraPartir = enmascararLiterales(contenido);
            int desplazamiento = 0;

            // Cada sentencia completa. La cadena .perform(…).andExpect(…).andExpect(…)
            // termina en punto y coma, así que partir por ahí aísla una llamada entera.
            for (String sentencia : paraPartir.split(";")) {
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

    /**
     * Sustituye el contenido de cada literal de texto por {@code x}, carácter a carácter,
     * conservando los saltos de línea. El resultado tiene exactamente la misma longitud y las
     * mismas líneas que el original, pero ningún punto y coma que estuviera dentro de un
     * literal sobrevive para confundir al partidor.
     */
    private static String enmascararLiterales(String contenido) {
        return enmascarar(enmascarar(contenido, TEXT_BLOCK), STRING_LITERAL);
    }

    private static String enmascarar(String contenido, Pattern literal) {
        Matcher m = literal.matcher(contenido);
        StringBuilder resultado = new StringBuilder(contenido.length());
        int ultimo = 0;
        while (m.find()) {
            resultado.append(contenido, ultimo, m.start());
            for (int i = m.start(); i < m.end(); i++) {
                char c = contenido.charAt(i);
                resultado.append(c == '\n' ? '\n' : 'x');
            }
            ultimo = m.end();
        }
        resultado.append(contenido, ultimo, contenido.length());
        return resultado.toString();
    }

    private static List<Path> ficherosDeTest() throws IOException {
        try (Stream<Path> rutas = Files.walk(RAIZ)) {
            return rutas.filter((p) -> p.toString().endsWith(".java")).toList();
        }
    }
}
