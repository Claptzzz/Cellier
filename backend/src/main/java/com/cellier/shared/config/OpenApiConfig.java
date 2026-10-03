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

                                ## Cómo autenticarte en esta pantalla

                                1. Consigue un ID token de Google: la forma más simple es iniciar sesión
                                   en la propia aplicación web de Cellier y copiar el `idToken` que su
                                   cliente de Google Identity Services recibe al entrar (en desarrollo,
                                   la consola del navegador lo muestra; no hay forma de generarlo desde
                                   aquí, porque Swagger UI no sabe hablar con Google).
                                2. Canjéalo por credenciales propias de Cellier con
                                   **POST /api/v1/auth/google** (tag *Autenticación*), pulsando
                                   «Try it out» y pegando el `idToken` en el cuerpo. La respuesta trae
                                   un `accessToken` (dura 15 minutos) y un `refreshToken`.
                                3. Pulsa el botón **Authorize** (el candado, arriba a la derecha de esta
                                   página) y pega sólo el `accessToken`, sin el prefijo `Bearer` —Swagger
                                   UI lo añade solo—. Desde ahí, todas las peticiones que pruebes en esta
                                   pantalla llevan la cabecera `Authorization` puesta.
                                4. Si el `accessToken` caduca a mitad de la sesión, repite el canje con
                                   **POST /api/v1/auth/refresh** usando el `refreshToken`, y vuelve a
                                   pulsar Authorize con el `accessToken` nuevo.

                                ## Hogares y el código 404

                                Los recursos se agrupan por hogar (`householdId`). Toda operación sobre
                                un hogar exige que el usuario autenticado sea miembro de ese hogar.

                                **Un hogar ajeno responde `404 Not Found`, nunca `403 Forbidden`.** Es
                                deliberado: la API no confirma ni niega la existencia de un hogar que no
                                es tuyo, así que probar identificadores al azar no permite deducir
                                cuáles existen. El `403` queda reservado para cuando el hogar SÍ es
                                tuyo pero el recurso exige un rol que no tienes (por ejemplo, un
                                `ADMIN` para gestionar miembros): ahí ya sabes que el hogar existe y
                                que perteneces a él, así que decir por qué se rechaza la petición no
                                revela nada nuevo.
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
