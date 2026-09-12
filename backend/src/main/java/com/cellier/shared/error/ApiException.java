package com.cellier.shared.error;

import org.springframework.http.HttpStatus;

import java.util.Map;

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

    /**
     * Datos extra que se copian al cuerpo RFC 9457, junto a `title` y `detail`.
     *
     * <p>Existe para los errores que el cliente puede <em>usar</em> en vez de sólo mostrar:
     * un conflicto que dice cuál es el estado actual se resuelve en la misma pantalla, sin
     * una segunda petición. Por defecto no hay ninguno.
     */
    public Map<String, Object> getProperties() {
        return Map.of();
    }
}
