package com.cellier.shared.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    public static final String BEARER_SCHEME = "bearerAuth";

    @Bean
    public OpenAPI cellierOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Cellier API")
                        .version("v1")
                        .description("""
                                API de Cellier, la despensa compartida del hogar.

                                Los recursos se agrupan por hogar (`householdId`). Toda operación sobre
                                un hogar exige que el usuario autenticado sea miembro de ese hogar;
                                un hogar ajeno responde `404 Not Found`, nunca `403`.

                                Autenticación: token JWT en la cabecera `Authorization: Bearer <token>`.
                                """)
                        .contact(new Contact().name("Equipo Cellier"))
                        .license(new License().name("Uso interno")))
                .components(new Components()
                        .addSecuritySchemes(BEARER_SCHEME, new SecurityScheme()
                                .name(BEARER_SCHEME)
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("Token JWT emitido por Cellier.")));
    }
}
