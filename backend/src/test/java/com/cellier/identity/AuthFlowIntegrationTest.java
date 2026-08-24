package com.cellier.identity;

import com.cellier.PostgresTestcontainerConfig;
import com.cellier.identity.domain.ThemePreference;
import com.cellier.shared.error.UnauthorizedException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Recorre el flujo completo contra un PostgreSQL real. Google se sustituye por un doble:
 * la validación criptográfica del ID token se prueba aparte y aquí no se sale a la red.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainerConfig.class)
@DisplayName("Flujo de autenticación")
class AuthFlowIntegrationTest {

    private static final String GOOGLE_SUB = "112233445566778899000";
    private static final String EMAIL = "ana.rivas@gmail.com";
    private static final String ID_TOKEN = "id-token-de-google-de-prueba";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository users;

    @Autowired
    private RefreshTokenRepository refreshTokens;

    @MockitoBean
    private GoogleTokenVerifier googleTokenVerifier;

    @BeforeEach
    void setUp() {
        refreshTokens.deleteAll();
        users.deleteAll();
        when(googleTokenVerifier.verify(eq(ID_TOKEN)))
                .thenReturn(new GoogleIdentity(GOOGLE_SUB, EMAIL, "Ana Rivas",
                        "https://lh3.googleusercontent.com/a/ACg8ocK"));
    }

    @Test
    @DisplayName("/me sin token responde 401 con ProblemDetail")
    void meSinTokenDa401() throws Exception {
        mockMvc.perform(get("/api/v1/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.title").value("No autenticado"))
                .andExpect(jsonPath("$.instance").value("/api/v1/me"))
                // Nunca se filtra una traza al cliente.
                .andExpect(jsonPath("$.trace").doesNotExist())
                .andExpect(jsonPath("$.stackTrace").doesNotExist());
    }

    @Test
    @DisplayName("/me con un token inventado responde 401")
    void meConTokenInvalidoDa401() throws Exception {
        mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer no-es-un-jwt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    @DisplayName("/me con un access token válido responde 200 con el perfil")
    void meConTokenValidoDa200() throws Exception {
        String accessToken = login().get("accessToken").asText();

        mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(EMAIL))
                .andExpect(jsonPath("$.displayName").value("Ana Rivas"))
                .andExpect(jsonPath("$.locale").value("es-CL"))
                .andExpect(jsonPath("$.themePreference").value("SYSTEM"))
                .andExpect(jsonPath("$.id").isNotEmpty());
    }

    @Test
    @DisplayName("el login crea el usuario la primera vez y lo reutiliza después")
    void loginHaceUpsertPorGoogleSub() throws Exception {
        JsonNode primero = login();
        assertThat(users.count()).isEqualTo(1);

        // Google devuelve el nombre y el avatar actualizados en el segundo inicio de sesión.
        when(googleTokenVerifier.verify(eq(ID_TOKEN)))
                .thenReturn(new GoogleIdentity(GOOGLE_SUB, EMAIL, "Ana R. Rivas", "https://example.test/nuevo.png"));

        JsonNode segundo = login();

        assertThat(users.count()).isEqualTo(1);
        assertThat(segundo.get("user").get("id").asText())
                .isEqualTo(primero.get("user").get("id").asText());
        assertThat(segundo.get("user").get("displayName").asText()).isEqualTo("Ana R. Rivas");
        assertThat(segundo.get("user").get("avatarUrl").asText()).isEqualTo("https://example.test/nuevo.png");
    }

    @Test
    @DisplayName("un refresh token usado dos veces falla la segunda")
    void refreshReutilizadoFallaLaSegundaVez() throws Exception {
        String refreshToken = login().get("refreshToken").asText();

        String cuerpo = objectMapper.writeValueAsString(java.util.Map.of("refreshToken", refreshToken));

        // Primer canje: correcto, y devuelve un refresh token distinto.
        String respuesta = mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        assertThat(objectMapper.readTree(respuesta).get("refreshToken").asText()).isNotEqualTo(refreshToken);

        // Segundo canje con el mismo token: rechazado.
        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.detail").value("El refresh token no es válido."));
    }

    @Test
    @DisplayName("tras cerrar sesión el refresh token deja de servir")
    void logoutRevocaElRefreshToken() throws Exception {
        String refreshToken = login().get("refreshToken").asText();
        String cuerpo = objectMapper.writeValueAsString(java.util.Map.of("refreshToken", refreshToken));

        mockMvc.perform(post("/api/v1/auth/logout")
                        .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON).content(cuerpo))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("PATCH /me actualiza solo los campos enviados")
    void patchMeActualizaParcialmente() throws Exception {
        String accessToken = login().get("accessToken").asText();

        mockMvc.perform(patch("/api/v1/me")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"themePreference":"DARK"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.themePreference").value("DARK"))
                // No se tocó: sigue como estaba.
                .andExpect(jsonPath("$.displayName").value("Ana Rivas"))
                .andExpect(jsonPath("$.locale").value("es-CL"));

        assertThat(users.findAll().getFirst().getThemePreference()).isEqualTo(ThemePreference.DARK);
    }

    @Test
    @DisplayName("PATCH /me con un locale mal formado responde 400 con el detalle del campo")
    void patchMeValidaElLocale() throws Exception {
        String accessToken = login().get("accessToken").asText();

        mockMvc.perform(patch("/api/v1/me")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"locale":"esto no es un locale"}"""))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.title").value("Datos inválidos"))
                .andExpect(jsonPath("$.errors.locale").isNotEmpty());
    }

    @Test
    @DisplayName("un ID token que Google rechaza responde 401")
    void idTokenInvalidoDa401() throws Exception {
        when(googleTokenVerifier.verify(eq("token-malo")))
                .thenThrow(new UnauthorizedException("El ID token de Google no es válido."));

        mockMvc.perform(post("/api/v1/auth/google")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"idToken":"token-malo"}"""))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("El ID token de Google no es válido."));
    }

    @Test
    @DisplayName("POST /auth/google sin idToken responde 400")
    void loginSinIdTokenDa400() throws Exception {
        mockMvc.perform(post("/api/v1/auth/google")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.idToken").isNotEmpty());
    }

    @Test
    @DisplayName("el refresh token solo existe hasheado en la base de datos")
    void elRefreshTokenNoSePersisteEnClaro() throws Exception {
        String refreshToken = login().get("refreshToken").asText();

        assertThat(refreshTokens.findByTokenHash(refreshToken)).isEmpty();
        assertThat(refreshTokens.findByTokenHash(TokenService.hash(refreshToken))).isPresent();
    }

    /** Inicia sesión con el ID token de prueba y devuelve el cuerpo de la respuesta. */
    private JsonNode login() throws Exception {
        String body = mockMvc.perform(post("/api/v1/auth/google")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of("idToken", ID_TOKEN))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshToken").isNotEmpty())
                .andExpect(jsonPath("$.expiresIn").value(900))
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }
}
