package com.cellier.household;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("Generador de códigos de ingreso")
class JoinCodeGeneratorTest {

    /** Los caracteres que se confunden al dictar o copiar un código. */
    private static final String AMBIGUOUS = "01OIL";

    private final JoinCodeGenerator generator = new JoinCodeGenerator();

    @Test
    @DisplayName("el código tiene 8 caracteres alfanuméricos en mayúscula")
    void codigoDeOchoCaracteresEnMayuscula() {
        for (int i = 0; i < 500; i++) {
            assertThat(generator.next()).matches("^[A-Z0-9]{8}$");
        }
    }

    @Test
    @DisplayName("el código nunca contiene caracteres ambiguos: 0, 1, O, I ni L")
    void sinCaracteresAmbiguos() {
        for (int i = 0; i < 500; i++) {
            assertThat(generator.next()).doesNotContainAnyWhitespaces()
                    .satisfies(code -> {
                        for (char ambiguous : AMBIGUOUS.toCharArray()) {
                            assertThat(code).doesNotContain(String.valueOf(ambiguous));
                        }
                    });
        }
    }

    @Test
    @DisplayName("el alfabeto declarado no incluye ningún carácter ambiguo")
    void elAlfabetoEstaLimpio() {
        for (char ambiguous : AMBIGUOUS.toCharArray()) {
            assertThat(JoinCodeGenerator.ALPHABET).doesNotContain(String.valueOf(ambiguous));
        }
        assertThat(JoinCodeGenerator.ALPHABET).hasSize(31);
    }

    @Test
    @DisplayName("dos códigos seguidos no se repiten")
    void codigosVariados() {
        Set<String> generados = new HashSet<>();
        for (int i = 0; i < 1_000; i++) {
            generados.add(generator.next());
        }
        // Con 8,5·10¹¹ combinaciones, mil tiradas repetidas delatarían un generador roto
        // (una semilla fija, o un alfabeto colapsado) mucho antes que una colisión legítima.
        assertThat(generados).hasSize(1_000);
    }
}
