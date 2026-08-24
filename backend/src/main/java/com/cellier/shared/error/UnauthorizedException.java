package com.cellier.shared.error;

import org.springframework.http.HttpStatus;

public class UnauthorizedException extends ApiException {

    public UnauthorizedException(String detail) {
        super(HttpStatus.UNAUTHORIZED, "No autenticado", detail);
    }
}
