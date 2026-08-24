package com.cellier.shared.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    /** Rutas públicas: documentación, sondas de salud y los estáticos de la SPA. */
    private static final String[] PUBLIC_ENDPOINTS = {
            "/api/v1/health",
            "/actuator/health",
            "/actuator/health/**",
            "/actuator/info",
            "/swagger-ui.html",
            "/swagger-ui/**",
            "/v3/api-docs",
            "/v3/api-docs/**"
    };

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                // API stateless: sin sesión ni CSRF basado en cookie.
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(PUBLIC_ENDPOINTS).permitAll()
                        // El resto de la API exige autenticación (se cablea al introducir identity).
                        .requestMatchers("/api/**").authenticated()
                        .requestMatchers("/actuator/**").authenticated()
                        // Todo lo demás es la SPA (index.html y sus estáticos).
                        .anyRequest().permitAll())
                // Sin credenciales -> 401. Sin esto, el anónimo recibiría un 403 engañoso.
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)));

        // NOTA: el starter oauth2-resource-server ya está en el classpath, pero todavía no se
        // activa aquí. Habilitar `.oauth2ResourceServer(o -> o.jwt(...))` sin un issuer-uri /
        // jwk-set-uri configurado impide que el contexto arranque por falta de JwtDecoder.
        // Se cablea en el cambio que introduzca el módulo `identity`.

        return http.build();
    }
}
