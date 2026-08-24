package com.cellier.identity;

import com.cellier.shared.error.ProblemDetails;
import com.cellier.shared.error.UnauthorizedException;
import tools.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

/**
 * Traduce el `Authorization: Bearer <access token>` en un {@link CellierUserPrincipal}
 * dentro del SecurityContext.
 *
 * <p>Si no hay cabecera, la petición sigue como anónima y ya decidirá la cadena de seguridad
 * si el destino era público. Si la cabecera existe pero el token no sirve, se corta aquí con
 * un 401 explícito: el cliente necesita distinguir «no envié token» de «mi token caducó»
 * para saber cuándo llamar a `/api/v1/auth/refresh`.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final TokenService tokenService;
    private final ObjectMapper objectMapper;

    public JwtAuthenticationFilter(TokenService tokenService, ObjectMapper objectMapper) {
        this.tokenService = tokenService;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith(BEARER_PREFIX)) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = header.substring(BEARER_PREFIX.length()).trim();
        if (token.isEmpty()) {
            writeUnauthorized(request, response, "La cabecera Authorization no contiene un token.");
            return;
        }

        Authentication authentication;
        try {
            authentication = authenticationFrom(tokenService.decodeAccessToken(token), request);
        } catch (UnauthorizedException ex) {
            writeUnauthorized(request, response, ex.getMessage());
            return;
        }

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        try {
            filterChain.doFilter(request, response);
        } finally {
            // Stateless: el contexto no debe sobrevivir a la petición en el hilo del pool.
            SecurityContextHolder.clearContext();
        }
    }

    private Authentication authenticationFrom(Jwt jwt, HttpServletRequest request) {
        UUID userId;
        try {
            userId = UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException ex) {
            throw new UnauthorizedException("El access token no identifica a un usuario.");
        }

        CellierUserPrincipal principal = new CellierUserPrincipal(userId, jwt.getClaimAsString("email"));
        var authentication = new UsernamePasswordAuthenticationToken(principal, null, List.of());
        authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
        return authentication;
    }

    private void writeUnauthorized(HttpServletRequest request, HttpServletResponse response, String detail)
            throws IOException {
        SecurityContextHolder.clearContext();

        ProblemDetail problem = ProblemDetails.of(
                HttpStatus.UNAUTHORIZED, "No autenticado", detail, request.getRequestURI());

        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getOutputStream(), problem);
    }
}
