package com.cellier.shared.error;

import org.springframework.http.HttpStatus;

/**
 * Lo que llegó está bien formado pero no se puede aplicar.
 *
 * <p>Comparte título y estado con los errores de Bean Validation a propósito: para quien
 * llama son la misma clase de problema —los datos no sirven— y distinguirlos con dos estados
 * distintos le haría escribir dos caminos para una sola reacción.
 */
public class BadRequestException extends ApiException {

    public BadRequestException(String detail) {
        super(HttpStatus.BAD_REQUEST, "Datos inválidos", detail);
    }
}
