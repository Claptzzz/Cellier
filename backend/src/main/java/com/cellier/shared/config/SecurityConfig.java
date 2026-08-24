package com.cellier.shared.config;

import com.cellier.identity.JwtAuthenticationFilter;
import com.cellier.shared.error.ProblemDetails;
import tools.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import java.io.IOException;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    /** Rutas que se sirven sin credenciales. */
    private static final String[] PUBLIC_ENDPOINTS = {
            "/api/v1/auth/**",
            "/api/v1/health",
            "/actuator/health",
            "/actuator/health/**",
            "/actuator/info",
            "/swagger-ui.html",
            "/swagger-ui/**",
            "/v3/api-docs",
            "/v3/api-docs/**"
    };

    /** Estáticos de la SPA servidos desde el propio JAR. */
    private static final String[] SPA_RESOURCES = {
            "/",
            "/index.html",
            "/favicon.ico",
            "/*.js",
            "/*.css",
            "/*.webmanifest",
            "/assets/**",
            "/media/**"
    };

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final ObjectMapper objectMapper;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter, ObjectMapper objectMapper) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.objectMapper = objectMapper;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                // API con Bearer: no hay cookie de sesión que proteger, así que CSRF sobra.
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                .logout(logout -> logout.disable())
                .anonymous(anonymous -> anonymous.disable())
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(PUBLIC_ENDPOINTS).permitAll()
                        .requestMatchers(SPA_RESOURCES).permitAll()
                        .requestMatchers("/api/**").authenticated()
                        .requestMatchers("/actuator/**").authenticated()
                        // Rutas del router de Angular: las resuelve el fallback de SPA.
                        .anyRequest().permitAll())
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(problemEntryPoint())
                        .accessDeniedHandler(problemAccessDeniedHandler()))
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /** 401 en `application/problem+json`, igual que el resto de errores de la API. */
    private AuthenticationEntryPoint problemEntryPoint() {
        return (request, response, authException) -> writeProblem(request, response,
                HttpStatus.UNAUTHORIZED, "No autenticado", "Se requiere un access token válido.");
    }

    private AccessDeniedHandler problemAccessDeniedHandler() {
        return (request, response, deniedException) -> writeProblem(request, response,
                HttpStatus.FORBIDDEN, "Operación no permitida",
                "No tienes permiso para realizar esta operación.");
    }

    private void writeProblem(HttpServletRequest request, HttpServletResponse response,
                              HttpStatus status, String title, String detail) throws IOException {
        ProblemDetail problem = ProblemDetails.of(status, title, detail, request.getRequestURI());
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getOutputStream(), problem);
    }
}
