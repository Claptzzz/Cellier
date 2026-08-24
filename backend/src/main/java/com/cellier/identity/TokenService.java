package com.cellier.identity;

import com.cellier.identity.domain.RefreshToken;
import com.cellier.identity.domain.User;
import com.cellier.shared.config.AuthProperties;
import com.cellier.shared.error.UnauthorizedException;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Emisión y validación de las credenciales propias de Cellier.
 *
 * <p>El access token es un JWT HS256 de vida corta que el cliente presenta en cada petición.
 * El refresh token es un valor opaco de 256 bits: en la base solo se guarda su SHA-256, así
 * que una filtración de la tabla no entrega credenciales utilizables.
 *
 * <p>Cada refresh **rota**: el token presentado se revoca en la misma transacción en que se
 * emite el nuevo. Reutilizar uno ya gastado falla, que es la señal de que alguien copió el
 * token.
 */
@Service
public class TokenService {

    private static final Logger log = LoggerFactory.getLogger(TokenService.class);

    /** 256 bits de entropía por refresh token. */
    private static final int REFRESH_TOKEN_BYTES = 32;

    /** Tolerancia de reloj al validar `exp` de los access token. */
    private static final Duration ACCESS_TOKEN_CLOCK_SKEW = Duration.ofSeconds(30);

    private static final String CLAIM_EMAIL = "email";
    private static final String CLAIM_NAME = "name";

    private final RefreshTokenRepository refreshTokens;
    private final AuthProperties properties;
    private final Clock clock;
    private final SecureRandom secureRandom = new SecureRandom();
    private final JwtEncoder encoder;
    private final JwtDecoder decoder;

    public TokenService(RefreshTokenRepository refreshTokens, AuthProperties properties, Clock clock) {
        this.refreshTokens = refreshTokens;
        this.properties = properties;
        this.clock = clock;

        SecretKey key = hmacKey(properties.jwt().secret());
        this.encoder = new NimbusJwtEncoder(new ImmutableSecret<>(key));

        NimbusJwtDecoder jwtDecoder = NimbusJwtDecoder.withSecretKey(key)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
        // El validador de vigencia debe mirar el mismo reloj con el que se emiten los tokens.
        // Con el reloj del sistema por defecto, emitir y validar podrian discrepar.
        JwtTimestampValidator timestamps = new JwtTimestampValidator(ACCESS_TOKEN_CLOCK_SKEW);
        timestamps.setClock(clock);
        jwtDecoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                timestamps,
                new JwtIssuerValidator(properties.jwt().issuer())));
        this.decoder = jwtDecoder;
    }

    /** Emite un par de tokens nuevo para un usuario que acaba de autenticarse. */
    @Transactional
    public IssuedTokens issueFor(User user) {
        Instant now = clock.instant();
        Duration accessTtl = properties.jwt().accessTokenTtl();

        String accessToken = encodeAccessToken(user, now, accessTtl);
        String refreshToken = newRefreshToken(user, now);

        return new IssuedTokens(accessToken, refreshToken, accessTtl.toSeconds(), user);
    }

    /**
     * Canjea un refresh token por un par nuevo y revoca el presentado.
     *
     * @throws UnauthorizedException si el token no existe, ya se usó, se revocó o caducó
     */
    @Transactional
    public IssuedTokens rotate(String presentedRefreshToken) {
        Instant now = clock.instant();

        RefreshToken stored = refreshTokens.findByTokenHash(hash(presentedRefreshToken))
                .orElseThrow(() -> new UnauthorizedException("El refresh token no es válido."));

        if (!stored.isUsable(now)) {
            // Presentar un token ya revocado suele significar que hay una copia circulando:
            // se cierran todas las sesiones del usuario por precaución.
            if (stored.getRevokedAt() != null) {
                int closed = refreshTokens.revokeAllForUser(stored.getUser().getId(), now);
                log.warn("Refresh token reutilizado para el usuario {}: {} sesiones revocadas",
                        stored.getUser().getId(), closed);
            }
            throw new UnauthorizedException("El refresh token no es válido.");
        }

        User user = stored.getUser();
        if (!user.isActive()) {
            throw new UnauthorizedException("La cuenta ya no está activa.");
        }

        stored.revoke(now);

        Duration accessTtl = properties.jwt().accessTokenTtl();
        String accessToken = encodeAccessToken(user, now, accessTtl);
        String refreshToken = newRefreshToken(user, now);

        return new IssuedTokens(accessToken, refreshToken, accessTtl.toSeconds(), user);
    }

    /**
     * Revoca un refresh token. Es idempotente y silencioso a propósito: cerrar sesión con un
     * token ya inválido no debe delatar si ese token existió alguna vez.
     */
    @Transactional
    public void revoke(String presentedRefreshToken) {
        refreshTokens.findByTokenHash(hash(presentedRefreshToken))
                .ifPresent(token -> token.revoke(clock.instant()));
    }

    /**
     * Valida un access token emitido por Cellier.
     *
     * @throws UnauthorizedException si la firma, el emisor o la vigencia no cuadran
     */
    public Jwt decodeAccessToken(String accessToken) {
        try {
            // Firma, emisor y vigencia los comprueba el propio decodificador.
            return decoder.decode(accessToken);
        } catch (JwtException ex) {
            log.debug("Access token rechazado", ex);
            throw new UnauthorizedException("El access token no es válido o ha caducado.");
        }
    }

    private String encodeAccessToken(User user, Instant now, Duration ttl) {
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(properties.jwt().issuer())
                .subject(user.getId().toString())
                .issuedAt(now)
                .expiresAt(now.plus(ttl))
                .claim(CLAIM_EMAIL, user.getEmail())
                .claim(CLAIM_NAME, user.getDisplayName())
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    private String newRefreshToken(User user, Instant now) {
        byte[] raw = new byte[REFRESH_TOKEN_BYTES];
        secureRandom.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);

        refreshTokens.save(RefreshToken.issue(user, hash(token), now.plus(properties.refreshToken().ttl())));
        return token;
    }

    /** SHA-256 en hexadecimal. Es lo único que llega a la base de datos. */
    static String hash(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 debería estar disponible en cualquier JRE", ex);
        }
    }

    private static SecretKey hmacKey(String secret) {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            throw new IllegalStateException(
                    "cellier.auth.jwt.secret debe tener al menos 32 bytes para HS256; tiene " + bytes.length);
        }
        return new SecretKeySpec(bytes, "HmacSHA256");
    }
}
