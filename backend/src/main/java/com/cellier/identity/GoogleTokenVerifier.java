package com.cellier.identity;

import com.cellier.shared.config.AuthProperties;
import com.cellier.shared.error.UnauthorizedException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.JWKSourceBuilder;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jose.util.DefaultResourceRetriever;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;

import java.net.MalformedURLException;
import java.net.URI;
import java.net.URL;
import java.util.List;
import java.util.Set;

/**
 * Verifica los ID token que emite Google Identity Services.
 *
 * <p>Delega en Nimbus JOSE+JWT y en el decodificador de Spring Security: no se interpreta el
 * JWT a mano en ningún punto. Se comprueban, en este orden, la firma RSA contra el JWKS de
 * Google, el emisor, la audiencia (nuestro client id), la vigencia y que el correo esté
 * verificado.
 *
 * <p>Las claves públicas se mantienen en memoria mediante {@link JWKSourceBuilder}, que además
 * refresca de forma anticipada y limita la frecuencia de descarga, de modo que un pico de
 * inicios de sesión no se traduce en un pico de peticiones a Google.
 */
@Component
public class GoogleTokenVerifier {

    private static final Logger log = LoggerFactory.getLogger(GoogleTokenVerifier.class);

    private static final String CLAIM_EMAIL = "email";
    private static final String CLAIM_EMAIL_VERIFIED = "email_verified";
    private static final String CLAIM_NAME = "name";
    private static final String CLAIM_PICTURE = "picture";

    private final NimbusJwtDecoder decoder;

    public GoogleTokenVerifier(AuthProperties properties) {
        this.decoder = buildDecoder(properties.google());
    }

    /**
     * @return la identidad contenida en el token
     * @throws UnauthorizedException si el token no es válido por cualquier motivo
     */
    public GoogleIdentity verify(String idToken) {
        Jwt jwt;
        try {
            jwt = decoder.decode(idToken);
        } catch (JwtException ex) {
            // El motivo exacto se queda en el log: al cliente solo le decimos que no sirve.
            log.debug("ID token de Google rechazado", ex);
            throw new UnauthorizedException("El ID token de Google no es válido.");
        }

        if (!Boolean.TRUE.equals(jwt.getClaim(CLAIM_EMAIL_VERIFIED))) {
            throw new UnauthorizedException("La cuenta de Google no tiene el correo verificado.");
        }

        String subject = jwt.getSubject();
        String email = jwt.getClaimAsString(CLAIM_EMAIL);
        if (subject == null || subject.isBlank() || email == null || email.isBlank()) {
            throw new UnauthorizedException("El ID token de Google no identifica una cuenta.");
        }

        String name = jwt.getClaimAsString(CLAIM_NAME);
        return new GoogleIdentity(
                subject,
                email,
                name == null || name.isBlank() ? email : name,
                jwt.getClaimAsString(CLAIM_PICTURE));
    }

    private static NimbusJwtDecoder buildDecoder(AuthProperties.Google google) {
        JWKSource<SecurityContext> jwkSource = cachingJwkSource(google);

        DefaultJWTProcessor<SecurityContext> processor = new DefaultJWTProcessor<>();
        // Google firma los ID token con RS256. Fijar el algoritmo evita que un token
        // manipulado proponga uno más débil (o `none`).
        processor.setJWSKeySelector(new JWSVerificationKeySelector<>(JWSAlgorithm.RS256, jwkSource));

        NimbusJwtDecoder jwtDecoder = new NimbusJwtDecoder(processor);
        jwtDecoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                new JwtTimestampValidator(google.clockSkew()),
                issuerValidator(Set.copyOf(google.allowedIssuers())),
                audienceValidator(google.clientId())));
        return jwtDecoder;
    }

    private static JWKSource<SecurityContext> cachingJwkSource(AuthProperties.Google google) {
        URL jwksUrl;
        try {
            jwksUrl = URI.create(google.jwksUri()).toURL();
        } catch (MalformedURLException | IllegalArgumentException ex) {
            throw new IllegalStateException(
                    "cellier.auth.google.jwks-uri no es una URL válida: " + google.jwksUri(), ex);
        }

        long cacheTtlMs = google.jwksCacheTtl().toMillis();
        return JWKSourceBuilder.create(jwksUrl, new DefaultResourceRetriever(5_000, 5_000, 51_200))
                // Se sirven desde memoria durante `cacheTtlMs`, con refresco anticipado.
                .cache(cacheTtlMs, cacheTtlMs / 2)
                .refreshAheadCache(true)
                // Si aparece un `kid` desconocido (rotación de claves) se recarga, pero como
                // mucho una vez por minuto: así un token con `kid` basura no sirve de ariete.
                .rateLimited(60_000)
                .build();
    }

    /** Google emite `iss` como `accounts.google.com` o `https://accounts.google.com`. */
    private static OAuth2TokenValidator<Jwt> issuerValidator(Set<String> allowedIssuers) {
        return jwt -> {
            String issuer = jwt.getClaimAsString(JwtClaimNames.ISS);
            if (issuer != null && allowedIssuers.contains(issuer)) {
                return OAuth2TokenValidatorResult.success();
            }
            return OAuth2TokenValidatorResult.failure(
                    GoogleTokenErrors.invalidToken("El emisor del ID token no es Google."));
        };
    }

    private static OAuth2TokenValidator<Jwt> audienceValidator(String clientId) {
        return jwt -> {
            List<String> audience = jwt.getAudience();
            if (audience != null && audience.contains(clientId)) {
                return OAuth2TokenValidatorResult.success();
            }
            return OAuth2TokenValidatorResult.failure(
                    GoogleTokenErrors.invalidToken("El ID token fue emitido para otra aplicación."));
        };
    }
}
