package com.cellier.identity.web;

import com.cellier.identity.IssuedTokens;
import com.cellier.identity.TokenService;
import com.cellier.identity.UserHouseholdsView;
import com.cellier.identity.UserMapper;
import com.cellier.identity.UserRepository;
import com.cellier.identity.domain.User;
import com.cellier.identity.dto.AuthResponse;
import com.cellier.identity.dto.TestLoginRequest;
import com.cellier.shared.support.DatabaseCleaner;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.persistence.EntityManagerFactory;
import jakarta.validation.Valid;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;

/**
 * Atajos de autenticación y de estado, SOLO para las pruebas end-to-end de Playwright.
 *
 * <p><strong>Esta clase no existe fuera del perfil {@code test}.</strong> {@code @Profile}
 * hace que Spring ni siquiera registre el bean —y por tanto ninguna de sus rutas— cuando la
 * aplicación arranca con {@code dev} o {@code prod}: no es una comprobación en tiempo de
 * ejecución que alguien pueda olvidar, es que el objeto nunca llega a existir. {@code login}
 * emite credenciales reales de Cellier para un correo cualquiera sin pasar por Google, así que
 * si esto llegara a estar activo en producción cualquiera podría autenticarse como quien
 * quisiera: por eso vive bajo {@code /api/v1/auth/**} —ya público, pensado para el acceso
 * previo al login— y no en ningún otro sitio, y por eso el perfil se llama {@code test} y no
 * algo más fácil de activar por accidente, como {@code dev}.
 *
 * <p>Ambas rutas presuponen un Postgres efímero dedicado a E2E, nunca la base de desarrollo:
 * {@code reset} borra el esquema entero.
 */
@RestController
@RequestMapping("/api/v1/auth/test")
@Profile("test")
@Hidden
public class TestSupportController {

    private final UserRepository users;
    private final TokenService tokenService;
    private final UserMapper userMapper;
    private final UserHouseholdsView userHouseholds;
    private final EntityManagerFactory entityManagerFactory;

    public TestSupportController(UserRepository users,
                                 TokenService tokenService,
                                 UserMapper userMapper,
                                 UserHouseholdsView userHouseholds,
                                 EntityManagerFactory entityManagerFactory) {
        this.users = users;
        this.tokenService = tokenService;
        this.userMapper = userMapper;
        this.userHouseholds = userHouseholds;
        this.entityManagerFactory = entityManagerFactory;
    }

    /**
     * Emite credenciales de Cellier para el correo indicado, creando la cuenta si es la
     * primera vez que se pide. El `sub` sintético que identifica al usuario está prefijado a
     * propósito, para que nunca pueda chocar con un `sub` real de Google.
     */
    @PostMapping(path = "/login",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public AuthResponse login(@Valid @RequestBody TestLoginRequest request) {
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        String sub = "e2e-test:" + email;

        User user = users.findByGoogleSubAndDeletedAtIsNull(sub)
                .orElseGet(() -> users.saveAndFlush(User.fromGoogle(
                        sub, email, displayNameOrEmail(request, email), null)));

        IssuedTokens tokens = tokenService.issueFor(user);
        return new AuthResponse(
                tokens.accessToken(),
                tokens.refreshToken(),
                tokens.expiresIn(),
                userMapper.toProfile(user, userHouseholds.householdsOf(user.getId())));
    }

    /**
     * Vacía el esquema entero, en el orden que exigen las claves foráneas. Lo llama el setup
     * de cada archivo de pruebas de Playwright antes de sembrar sus propios datos, para que
     * ningún escenario herede estado de otro.
     */
    @PostMapping(path = "/reset")
    public ResponseEntity<Void> reset() {
        DatabaseCleaner.cleanAll(entityManagerFactory);
        return ResponseEntity.noContent().build();
    }

    private static String displayNameOrEmail(TestLoginRequest request, String email) {
        String name = request.displayName();
        return name == null || name.isBlank() ? email : name;
    }
}
