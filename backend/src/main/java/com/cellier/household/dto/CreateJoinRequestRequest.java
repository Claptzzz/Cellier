package com.cellier.household.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import java.util.Locale;

/**
 * Solicitud de ingreso a partir del código de un hogar.
 *
 * <p>El código se normaliza —se recortan los espacios y se pasa a mayúsculas— antes de
 * validarlo, porque llega tecleado a mano desde una foto o un mensaje. Escribir
 * {@code " k7m2qp9x "} funciona; lo que no se corrige es un carácter que el alfabeto no
 * contempla, porque ahí no hay forma de adivinar qué se quiso escribir.
 */
@Schema(name = "CreateJoinRequestRequest", description = "Código de ingreso del hogar al que se quiere entrar.")
public record CreateJoinRequestRequest(

        @Schema(description = """
                Código de 8 caracteres del hogar. No distingue mayúsculas de minúsculas y se
                ignoran los espacios sobrantes.""",
                example = "K7M2QP9X")
        @NotBlank(message = "El código de ingreso es obligatorio")
        @Pattern(regexp = "^[A-HJKMNP-Z2-9]{8}$",
                message = "El código tiene 8 caracteres alfanuméricos y no incluye 0, O, 1, I ni L")
        String joinCode
) {

    public CreateJoinRequestRequest {
        if (joinCode != null) {
            // Locale.ROOT y no el del sistema: en turco, "i".toUpperCase() no da "I".
            joinCode = joinCode.trim().toUpperCase(Locale.ROOT);
        }
    }
}
