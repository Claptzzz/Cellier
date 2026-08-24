package com.cellier.shared.error;

import org.springframework.http.HttpStatus;

public class ForbiddenException extends ApiException {

    public ForbiddenException(String detail) {
        super(HttpStatus.FORBIDDEN, "Operación no permitida", detail);
    }
}
