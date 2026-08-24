package com.cellier.shared.error;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Traduce las excepciones de la aplicación a `application/problem+json` (RFC 9457).
 *
 * <p>Ninguna respuesta incluye trazas de pila ni mensajes de excepciones internas: lo que
 * viaja al cliente es siempre un texto redactado a propósito. Lo demás se registra en el log
 * del servidor.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** Errores de negocio con estado propio: 401, 403, 404, 409. */
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ProblemDetail> handleApiException(ApiException ex, HttpServletRequest request) {
        ProblemDetail problem = ProblemDetails.of(ex.getStatus(), ex.getTitle(), ex.getMessage(), request);
        return ResponseEntity.status(ex.getStatus()).body(problem);
    }

    /** Fallo de autenticación levantado por Spring Security dentro de un controlador. */
    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ProblemDetail> handleAuthentication(AuthenticationException ex,
                                                              HttpServletRequest request) {
        log.debug("Fallo de autenticación en {}", request.getRequestURI(), ex);
        ProblemDetail problem = ProblemDetails.of(HttpStatus.UNAUTHORIZED, "No autenticado",
                "Se requiere un access token válido.", request);
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(problem);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ProblemDetail> handleAccessDenied(AccessDeniedException ex,
                                                            HttpServletRequest request) {
        log.debug("Acceso denegado en {}", request.getRequestURI(), ex);
        ProblemDetail problem = ProblemDetails.of(HttpStatus.FORBIDDEN, "Operación no permitida",
                "No tienes permiso para realizar esta operación.", request);
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(problem);
    }

    /** Validación de parámetros sueltos (@RequestParam, @PathVariable). */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ProblemDetail> handleConstraintViolation(ConstraintViolationException ex,
                                                                   HttpServletRequest request) {
        ProblemDetail problem = ProblemDetails.of(HttpStatus.BAD_REQUEST, "Datos inválidos",
                "La petición contiene parámetros que no cumplen las restricciones.", request);
        Map<String, String> errors = new LinkedHashMap<>();
        for (ConstraintViolation<?> violation : ex.getConstraintViolations()) {
            errors.put(violation.getPropertyPath().toString(), violation.getMessage());
        }
        problem.setProperty("errors", errors);
        return ResponseEntity.badRequest().body(problem);
    }

    /** Cualquier cosa no prevista: 500 sin filtrar nada al cliente. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> handleUnexpected(Exception ex, HttpServletRequest request) {
        log.error("Error no controlado en {} {}", request.getMethod(), request.getRequestURI(), ex);
        ProblemDetail problem = ProblemDetails.of(HttpStatus.INTERNAL_SERVER_ERROR, "Error interno",
                "Ocurrió un error inesperado. Inténtalo de nuevo más tarde.", request);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(problem);
    }

    /** Validación del cuerpo (@Valid sobre un @RequestBody): detalla campo a campo. */
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
                                                                  HttpHeaders headers,
                                                                  HttpStatusCode status,
                                                                  WebRequest request) {
        ProblemDetail problem = ProblemDetails.of(HttpStatus.BAD_REQUEST, "Datos inválidos",
                "Uno o más campos del cuerpo de la petición no son válidos.", instanceOf(request));

        Map<String, String> errors = new LinkedHashMap<>();
        for (org.springframework.validation.FieldError error : ex.getBindingResult().getFieldErrors()) {
            errors.merge(error.getField(), messageOf(error), (a, b) -> a + "; " + b);
        }
        List<String> globals = ex.getBindingResult().getGlobalErrors().stream()
                .map(error -> error.getDefaultMessage() == null ? "Valor inválido" : error.getDefaultMessage())
                .toList();
        problem.setProperty("errors", errors);
        if (!globals.isEmpty()) {
            problem.setProperty("globalErrors", globals);
        }

        return ResponseEntity.badRequest().body(problem);
    }

    /** Cuerpo ausente o JSON mal formado. No se expone el detalle del parser. */
    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException ex,
                                                                   HttpHeaders headers,
                                                                   HttpStatusCode status,
                                                                   WebRequest request) {
        log.debug("Cuerpo ilegible", ex);
        ProblemDetail problem = ProblemDetails.of(HttpStatus.BAD_REQUEST, "Datos inválidos",
                "El cuerpo de la petición falta o no es un JSON válido.", instanceOf(request));
        return ResponseEntity.badRequest().body(problem);
    }

    private static String messageOf(org.springframework.validation.FieldError error) {
        return error.getDefaultMessage() == null ? "Valor inválido" : error.getDefaultMessage();
    }

    private static String instanceOf(WebRequest request) {
        String description = request.getDescription(false);
        return description.startsWith("uri=") ? description.substring(4) : null;
    }
}
