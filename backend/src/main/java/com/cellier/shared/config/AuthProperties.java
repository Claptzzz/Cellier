package com.cellier.shared.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;
import java.util.List;

/**
 * Configuración de autenticación. Todo llega por variable de entorno; en `prod` no hay
 * valores por defecto, de modo que un despliegue mal configurado falla al arrancar en vez
 * de quedarse funcionando con secretos de juguete.
 */
@Validated
@ConfigurationProperties(prefix = "cellier.auth")
public record AuthProperties(

        @Valid @NotNull Google google,
        @Valid @NotNull Jwt jwt,
        @Valid @NotNull RefreshToken refreshToken
) {

    /**
     * @param clientId       OAuth client id de Google; se exige como `aud` del ID token
     * @param jwksUri        endpoint del JWKS de Google
     * @param allowedIssuers emisores aceptados: Google usa dos formas del mismo `iss`
     * @param jwksCacheTtl   cuánto se guardan en memoria las claves públicas
     * @param clockSkew      tolerancia de reloj al validar `exp` / `iat`
     */
    public record Google(
            @NotBlank String clientId,
            @NotBlank String jwksUri,
            @NotEmpty List<String> allowedIssuers,
            @DefaultValue("PT1H") Duration jwksCacheTtl,
            @DefaultValue("PT60S") Duration clockSkew
    ) {
    }

    /**
     * @param issuer         valor del claim `iss` de los tokens que emite Cellier
     * @param secret         clave HMAC; mínimo 32 bytes para HS256
     * @param accessTokenTtl vigencia del access token
     */
    public record Jwt(
            @NotBlank String issuer,
            @NotBlank String secret,
            @DefaultValue("PT15M") Duration accessTokenTtl
    ) {
    }

    /**
     * @param ttl vigencia del refresh token opaco
     */
    public record RefreshToken(
            @DefaultValue("P30D") Duration ttl
    ) {
    }
}
