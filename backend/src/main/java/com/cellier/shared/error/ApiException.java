package com.cellier.shared.error;

import org.springframework.http.HttpStatus;

/**
 * Excepción de negocio que ya sabe con qué estado HTTP debe traducirse.
 * El mensaje viaja al cliente, así que no debe contener detalles internos.
 */
public abstract class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String title;

    protected ApiException(HttpStatus status, String title, String detail) {
        super(detail);
        this.status = status;
        this.title = title;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getTitle() {
        return title;
    }
}
