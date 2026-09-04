package com.cellier.household;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;

/**
 * Genera los códigos de ingreso de los hogares.
 *
 * <p>Ocho caracteres de un alfabeto de 31 símbolos dan unas 8,5·10¹¹ combinaciones, así que
 * el código no se adivina por fuerza bruta en un plazo útil. Aun así no es un secreto de
 * seguridad: conocerlo solo permite <em>solicitar</em> el ingreso, y la solicitud la aprueba
 * una persona. La entropía está aquí para que dos hogares no colisionen y para que nadie
 * tropiece con un hogar ajeno tecleando al azar, no como única barrera de acceso.
 */
@Component
public class JoinCodeGenerator {

    /**
     * Mayúsculas y dígitos sin los caracteres que se confunden al leer un código en voz alta
     * o al copiarlo de una pantalla: fuera 0 y O, fuera 1, I y L. Un código de ingreso se
     * dicta y se teclea a mano, así que la ambigüedad se paga en soporte.
     */
    static final String ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    static final int LENGTH = 8;

    private final SecureRandom random = new SecureRandom();

    public String next() {
        StringBuilder code = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            code.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return code.toString();
    }
}
