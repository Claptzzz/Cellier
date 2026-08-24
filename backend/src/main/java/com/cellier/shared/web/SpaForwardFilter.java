package com.cellier.shared.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Fallback de SPA: reenvía las rutas desconocidas a {@code /index.html} para que el router de
 * Angular resuelva el deep-link (por ejemplo, recargar la página en {@code /pantry/42}).
 *
 * <p>Nunca intercepta las rutas del backend ({@code /api/**}, {@code /swagger-ui/**},
 * {@code /v3/api-docs/**}, {@code /actuator/**}) ni las peticiones que piden un archivo
 * concreto (cualquier ruta cuyo último segmento tenga extensión), de modo que un asset
 * inexistente sigue devolviendo 404 en lugar de HTML.
 */
public class SpaForwardFilter extends OncePerRequestFilter {

    private static final String INDEX = "/index.html";

    private static final String[] BACKEND_PREFIXES = {
            "/api/",
            "/swagger-ui/",
            "/v3/api-docs",
            "/actuator/",
            "/error"
    };

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String path = request.getRequestURI().substring(request.getContextPath().length());

        if (shouldForward(path)) {
            request.getRequestDispatcher(INDEX).forward(request, response);
            return;
        }

        filterChain.doFilter(request, response);
    }

    static boolean shouldForward(String path) {
        if (path == null || path.isEmpty() || INDEX.equals(path) || "/".equals(path)) {
            return false;
        }
        if ("/swagger-ui.html".equals(path)) {
            return false;
        }
        for (String prefix : BACKEND_PREFIXES) {
            if (path.startsWith(prefix)) {
                return false;
            }
        }
        // Un último segmento con extensión es un asset: que lo resuelva el resource handler.
        int lastSlash = path.lastIndexOf('/');
        return path.indexOf('.', lastSlash + 1) < 0;
    }
}
