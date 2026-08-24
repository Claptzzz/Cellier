package com.cellier.shared.error;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

import java.net.URI;

/** Construcción uniforme de respuestas RFC 9457. */
public final class ProblemDetails {

    private static final String TYPE_PREFIX = "https://cellier.app/problems/";

    private ProblemDetails() {
    }

    public static ProblemDetail of(HttpStatus status, String title, String detail, String instance) {
        ProblemDetail problem = ProblemDetail.forStatus(status);
        problem.setType(URI.create(TYPE_PREFIX + slug(status)));
        problem.setTitle(title);
        problem.setDetail(detail);
        if (instance != null) {
            problem.setInstance(URI.create(instance));
        }
        return problem;
    }

    public static ProblemDetail of(HttpStatus status, String title, String detail, HttpServletRequest request) {
        return of(status, title, detail, request == null ? null : request.getRequestURI());
    }

    private static String slug(HttpStatus status) {
        return status.name().toLowerCase().replace('_', '-');
    }
}
