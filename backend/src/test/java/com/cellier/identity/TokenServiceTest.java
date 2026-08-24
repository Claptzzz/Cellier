package com.cellier.identity;

import com.cellier.identity.domain.RefreshToken;
import com.cellier.identity.domain.User;
import com.cellier.shared.config.AuthProperties;
import com.cellier.shared.error.UnauthorizedException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@DisplayName("TokenService")
class TokenServiceTest {

    private static final String ISSUER = "https://cellier.app";
    private static final String SECRET = "un-secreto-de-pruebas-con-mas-de-32-bytes-de-longitud";
    private static final Instant T0 = Instant.parse("2026-08-24T12:00:00Z");

    private Map<String, RefreshToken> store;
    private RefreshTokenRepository refreshTokens;
    private MutableClock clock;
    private User user;

    @BeforeEach
    void setUp() {
        store = new LinkedHashMap<>();
        clock = new MutableClock(T0);
        user = activeUser();
        refreshTokens = fakeRepository();
    }

    private TokenService serviceWith(Duration accessTtl) {
        AuthProperties properties = new AuthProperties(
                new AuthProperties.Google(
                        "cellier-test.apps.googleusercontent.com",
                        "https://www.googleapis.com/oauth2/v3/certs",
                        List.of("https://accounts.google.com"),
                        Duration.ofHours(1),
                        Duration.ofSeconds(60)),
                new AuthProperties.Jwt(ISSUER, SECRET, accessTtl),
                new AuthProperties.RefreshToken(Duration.ofDays(30)));
        return new TokenService(refreshTokens, properties, clock);
    }

    private TokenService service() {
        return serviceWith(Duration.ofMinutes(15));
    }

    @Nested
    @DisplayName("emisión")
    class Emision {

        @Test
        @DisplayName("el access token lleva sub, email y name, y caduca según la configuración")
        void accessTokenLlevaLosClaims() {
            TokenService service = service();

            IssuedTokens tokens = service.issueFor(user);
            Jwt jwt = service.decodeAccessToken(tokens.accessToken());

            assertThat(jwt.getSubject()).isEqualTo(user.getId().toString());
            assertThat(jwt.getClaimAsString("email")).isEqualTo(user.getEmail());
            assertThat(jwt.getClaimAsString("name")).isEqualTo(user.getDisplayName());
            assertThat(jwt.getClaimAsString("iss")).isEqualTo(ISSUER);
            assertThat(tokens.expiresIn()).isEqualTo(Duration.ofMinutes(15).toSeconds());
            assertThat(jwt.getExpiresAt()).isEqualTo(T0.plus(Duration.ofMinutes(15)));
        }

        @Test
        @DisplayName("el refresh token se guarda solo como hash SHA-256, nunca en claro")
        void refreshTokenSeGuardaHasheado() {
            IssuedTokens tokens = service().issueFor(user);

            assertThat(store).hasSize(1);
            String storedHash = store.keySet().iterator().next();
            assertThat(storedHash)
                    .isEqualTo(TokenService.hash(tokens.refreshToken()))
                    .hasSize(64)
                    .isNotEqualTo(tokens.refreshToken());
            assertThat(store.values()).noneMatch(t -> t.getTokenHash().equals(tokens.refreshToken()));
        }

        @Test
        @DisplayName("dos emisiones seguidas producen refresh tokens distintos")
        void cadaRefreshTokenEsUnico() {
            TokenService service = service();

            IssuedTokens primero = service.issueFor(user);
            IssuedTokens segundo = service.issueFor(user);

            assertThat(primero.refreshToken()).isNotEqualTo(segundo.refreshToken());
            assertThat(store).hasSize(2);
        }
    }

    @Nested
    @DisplayName("expiración")
    class Expiracion {

        @Test
        @DisplayName("un access token caducado se rechaza")
        void accessTokenCaducadoSeRechaza() {
            TokenService service = service();
            String token = service.issueFor(user).accessToken();

            // Justo antes de caducar sigue sirviendo...
            clock.advance(Duration.ofMinutes(14));
            assertThat(service.decodeAccessToken(token)).isNotNull();

            // ...y pasada la vigencia mas la tolerancia de reloj, deja de servir.
            clock.advance(Duration.ofMinutes(2));
            assertThatThrownBy(() -> service.decodeAccessToken(token))
                    .isInstanceOf(UnauthorizedException.class)
                    .hasMessageContaining("no es válido o ha caducado");
        }

        @Test
        @DisplayName("un refresh token caducado no se puede canjear")
        void refreshTokenCaducadoNoSeCanjea() {
            TokenService service = service();
            IssuedTokens tokens = service.issueFor(user);

            clock.advance(Duration.ofDays(31));

            assertThatThrownBy(() -> service.rotate(tokens.refreshToken()))
                    .isInstanceOf(UnauthorizedException.class)
                    .hasMessageContaining("El refresh token no es válido");
        }

        @Test
        @DisplayName("un access token firmado con otra clave se rechaza")
        void firmaAjenaSeRechaza() {
            String ajeno = serviceWith(Duration.ofMinutes(15)).issueFor(user).accessToken();

            AuthProperties otras = new AuthProperties(
                    new AuthProperties.Google("x", "https://example.test/jwks", List.of("https://accounts.google.com"),
                            Duration.ofHours(1), Duration.ofSeconds(60)),
                    new AuthProperties.Jwt(ISSUER, "OTRO-secreto-distinto-de-mas-de-32-bytes-aqui", Duration.ofMinutes(15)),
                    new AuthProperties.RefreshToken(Duration.ofDays(30)));
            TokenService conOtraClave = new TokenService(refreshTokens, otras, clock);

            assertThatThrownBy(() -> conOtraClave.decodeAccessToken(ajeno))
                    .isInstanceOf(UnauthorizedException.class);
        }
    }

    @Nested
    @DisplayName("rotación")
    class Rotacion {

        @Test
        @DisplayName("al refrescar se revoca el token usado y se emite uno nuevo")
        void rotarRevocaElAnterior() {
            TokenService service = service();
            IssuedTokens original = service.issueFor(user);

            clock.advance(Duration.ofMinutes(5));
            IssuedTokens rotado = service.rotate(original.refreshToken());

            assertThat(rotado.refreshToken()).isNotEqualTo(original.refreshToken());
            assertThat(rotado.accessToken()).isNotEqualTo(original.accessToken());

            RefreshToken anterior = store.get(TokenService.hash(original.refreshToken()));
            assertThat(anterior.getRevokedAt()).isEqualTo(T0.plus(Duration.ofMinutes(5)));
            assertThat(anterior.isUsable(clock.instant())).isFalse();

            RefreshToken nuevo = store.get(TokenService.hash(rotado.refreshToken()));
            assertThat(nuevo.isUsable(clock.instant())).isTrue();
        }

        @Test
        @DisplayName("el token recién rotado sí se puede volver a canjear")
        void elNuevoTokenSirve() {
            TokenService service = service();
            IssuedTokens primero = service.rotate(service.issueFor(user).refreshToken());

            IssuedTokens segundo = service.rotate(primero.refreshToken());

            assertThat(segundo.refreshToken()).isNotEqualTo(primero.refreshToken());
        }
    }

    @Nested
    @DisplayName("reutilización y revocación")
    class Revocacion {

        @Test
        @DisplayName("reutilizar un refresh token ya gastado falla")
        void reutilizarFalla() {
            TokenService service = service();
            IssuedTokens original = service.issueFor(user);
            service.rotate(original.refreshToken());

            assertThatThrownBy(() -> service.rotate(original.refreshToken()))
                    .isInstanceOf(UnauthorizedException.class)
                    .hasMessageContaining("El refresh token no es válido");
        }

        @Test
        @DisplayName("reutilizar un token gastado revoca todas las sesiones vivas del usuario")
        void reutilizarCierraTodasLasSesiones() {
            TokenService service = service();
            IssuedTokens sesionA = service.issueFor(user);
            IssuedTokens sesionB = service.issueFor(user);
            IssuedTokens rotadaA = service.rotate(sesionA.refreshToken());

            assertThatThrownBy(() -> service.rotate(sesionA.refreshToken()))
                    .isInstanceOf(UnauthorizedException.class);

            assertThat(store.get(TokenService.hash(sesionB.refreshToken())).getRevokedAt()).isNotNull();
            assertThat(store.get(TokenService.hash(rotadaA.refreshToken())).getRevokedAt()).isNotNull();
        }

        @Test
        @DisplayName("logout revoca el token y deja de servir")
        void logoutRevoca() {
            TokenService service = service();
            IssuedTokens tokens = service.issueFor(user);

            service.revoke(tokens.refreshToken());

            assertThat(store.get(TokenService.hash(tokens.refreshToken())).getRevokedAt()).isEqualTo(T0);
            assertThatThrownBy(() -> service.rotate(tokens.refreshToken()))
                    .isInstanceOf(UnauthorizedException.class);
        }

        @Test
        @DisplayName("logout con un token desconocido no falla")
        void logoutDesconocidoEsIdempotente() {
            service().revoke("un-token-que-nunca-existio");

            assertThat(store).isEmpty();
        }

        @Test
        @DisplayName("un usuario dado de baja no puede refrescar")
        void usuarioBorradoNoRefresca() {
            TokenService service = service();
            IssuedTokens tokens = service.issueFor(user);
            ReflectionTestUtils.setField(user, "deletedAt", T0);

            assertThatThrownBy(() -> service.rotate(tokens.refreshToken()))
                    .isInstanceOf(UnauthorizedException.class)
                    .hasMessageContaining("La cuenta ya no está activa");
        }
    }

    private static User activeUser() {
        User user = User.fromGoogle("google-sub-123", "ana.rivas@gmail.com", "Ana Rivas", null);
        ReflectionTestUtils.setField(user, "id", UUID.randomUUID());
        return user;
    }

    /** Repositorio en memoria: basta para ejercitar la lógica de tokens sin base de datos. */
    private RefreshTokenRepository fakeRepository() {
        RefreshTokenRepository repository = mock(RefreshTokenRepository.class);

        when(repository.save(any(RefreshToken.class))).thenAnswer(invocation -> {
            RefreshToken token = invocation.getArgument(0);
            store.put(token.getTokenHash(), token);
            return token;
        });
        when(repository.findByTokenHash(anyString())).thenAnswer(invocation ->
                Optional.ofNullable(store.get(invocation.<String>getArgument(0))));
        when(repository.revokeAllForUser(any(UUID.class), any(Instant.class))).thenAnswer(invocation -> {
            UUID userId = invocation.getArgument(0);
            Instant at = invocation.getArgument(1);
            List<RefreshToken> affected = new ArrayList<>();
            for (RefreshToken token : store.values()) {
                if (token.getUser().getId().equals(userId) && token.getRevokedAt() == null) {
                    token.revoke(at);
                    affected.add(token);
                }
            }
            return affected.size();
        });

        return repository;
    }
}
