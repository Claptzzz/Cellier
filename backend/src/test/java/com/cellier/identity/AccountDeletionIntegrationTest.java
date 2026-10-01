package com.cellier.identity;

import com.cellier.PostgresTestcontainerConfig;
import com.cellier.shared.support.DatabaseCleaner;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * La baja de cuenta ({@code DELETE /api/v1/me}): anonimiza, revoca sesiones, sale de los
 * hogares donde eso no rompe R4, y se niega —con la lista de hogares— cuando sí lo haría.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainerConfig.class)
@DisplayName("Baja de cuenta")
class AccountDeletionIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository users;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @MockitoBean
    private GoogleTokenVerifier googleTokenVerifier;

    private String accessAna;
    private String refreshAna;

    @BeforeEach
    void setUp() {
        DatabaseCleaner.cleanAll(entityManagerFactory);
    }

    @Nested
    @DisplayName("Sin hogares que bloqueen")
    class SinBloqueo {

        @Test
        @DisplayName("elimina la cuenta, revoca las sesiones y anonimiza el perfil")
        void bajaLimpia() throws Exception {
            iniciarSesionComoAna();

            mockMvc.perform(delete("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna))
                    .andExpect(status().isNoContent());

            // El correo y el nombre ya no son los originales.
            var anonimizado = users.findAll().stream()
                    .filter(u -> "sub-ana".equals(u.getGoogleSub()))
                    .findFirst()
                    .orElseThrow();
            assertThat(anonimizado.getEmail()).doesNotContain("ana.rivas");
            assertThat(anonimizado.getDisplayName()).isEqualTo("Usuario eliminado");
            assertThat(anonimizado.getDeletedAt()).isNotNull();

            // El refresh token ya no sirve.
            mockMvc.perform(post("/api/v1/auth/refresh")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of("refreshToken", refreshAna))))
                    .andExpect(status().isUnauthorized());

            // El access token tampoco: la cuenta ya no está activa.
            mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("sale de un hogar donde es simple miembro, sin tocar el rol de nadie más")
        void salePorSerSoloMiembro() throws Exception {
            iniciarSesionComoAna();
            String accessBruno = login("token-bruno", "sub-bruno", "bruno.soto@gmail.com", "Bruno Soto")
                    .get("accessToken").asText();

            UUID hogar = crearHogar(accessBruno, "Depa Ñuñoa");
            hacerMiembro(hogar, accessBruno, accessAna);

            mockMvc.perform(delete("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna))
                    .andExpect(status().isNoContent());

            // Bruno sigue siendo administrador de su hogar, y ahora es el único miembro.
            mockMvc.perform(get("/api/v1/households/" + hogar).header(HttpHeaders.AUTHORIZATION, "Bearer " + accessBruno))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.memberCount").value(1));
        }

        @Test
        @DisplayName("sale también de los hogares donde administra, si hay otro administrador")
        void saleDeUnHogarConOtroAdmin() throws Exception {
            iniciarSesionComoAna();
            UUID hogar = crearHogar(accessAna, "Casa Rivas");
            String accessBruno = login("token-bruno", "sub-bruno", "bruno.soto@gmail.com", "Bruno Soto")
                    .get("accessToken").asText();
            UUID idBruno = idDeUsuario("bruno.soto@gmail.com");
            hacerMiembro(hogar, accessAna, accessBruno);
            mockMvc.perform(patch("/api/v1/households/" + hogar + "/members/" + idBruno)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"role":"ADMIN"}"""))
                    .andExpect(status().isOk());

            mockMvc.perform(delete("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna))
                    .andExpect(status().isNoContent());

            mockMvc.perform(get("/api/v1/households/" + hogar).header(HttpHeaders.AUTHORIZATION, "Bearer " + accessBruno))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.memberCount").value(1))
                    .andExpect(jsonPath("$.role").value("ADMIN"));
        }
    }

    @Nested
    @DisplayName("Último administrador")
    class UltimoAdministrador {

        @Test
        @DisplayName("rechaza la baja con 409 y lista el hogar bloqueante")
        void rechazaLaBaja() throws Exception {
            iniciarSesionComoAna();
            UUID hogar = crearHogar(accessAna, "Casa Rivas");

            mockMvc.perform(delete("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.blockingHouseholds.length()").value(1))
                    .andExpect(jsonPath("$.blockingHouseholds[0].id").value(hogar.toString()))
                    .andExpect(jsonPath("$.blockingHouseholds[0].name").value("Casa Rivas"));

            // Nada se deshizo: sigue pudiendo autenticarse y el hogar sigue en pie.
            mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.households.length()").value(1));
        }

        @Test
        @DisplayName("lista todos los hogares donde es el único administrador, no solo el primero")
        void listaVariosHogaresBloqueantes() throws Exception {
            iniciarSesionComoAna();
            crearHogar(accessAna, "Casa Rivas");
            crearHogar(accessAna, "Depa de verano");

            mockMvc.perform(delete("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.blockingHouseholds.length()").value(2));
        }
    }

    @Nested
    @DisplayName("Exportar datos")
    class ExportarDatos {

        @Test
        @DisplayName("devuelve la misma forma que /me, con cabecera de descarga")
        void exportaElPerfil() throws Exception {
            iniciarSesionComoAna();
            crearHogar(accessAna, "Casa Rivas");

            mockMvc.perform(get("/api/v1/me/export").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna))
                    .andExpect(status().isOk())
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                            .header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"cellier-datos.json\""))
                    .andExpect(jsonPath("$.email").value("ana.rivas@gmail.com"))
                    .andExpect(jsonPath("$.households.length()").value(1))
                    .andExpect(jsonPath("$.households[0].name").value("Casa Rivas"));
        }
    }

    @Nested
    @DisplayName("PATCH /me persiste locale y themePreference")
    class PatchPersisteLocale {

        @Test
        @DisplayName("el locale enviado sobrevive a una relectura del perfil")
        void localePersiste() throws Exception {
            iniciarSesionComoAna();

            mockMvc.perform(patch("/api/v1/me")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"locale":"en-US","themePreference":"LIGHT"}"""))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.locale").value("en-US"))
                    .andExpect(jsonPath("$.themePreference").value("LIGHT"));

            mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.locale").value("en-US"))
                    .andExpect(jsonPath("$.themePreference").value("LIGHT"));
        }
    }

    // ---------------------------------------------------------------------------------
    // Utilidades
    // ---------------------------------------------------------------------------------

    private void iniciarSesionComoAna() throws Exception {
        JsonNode sesion = login("token-ana", "sub-ana", "ana.rivas@gmail.com", "Ana Rivas");
        accessAna = sesion.get("accessToken").asText();
        refreshAna = sesion.get("refreshToken").asText();
    }

    private JsonNode login(String idToken, String sub, String email, String nombre) throws Exception {
        when(googleTokenVerifier.verify(idToken)).thenReturn(new GoogleIdentity(sub, email, nombre, null));
        return json(mockMvc.perform(post("/api/v1/auth/google")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("idToken", idToken))))
                .andExpect(status().isOk()));
    }

    private UUID crearHogar(String accessToken, String nombre) throws Exception {
        JsonNode creado = json(mockMvc.perform(post("/api/v1/households")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("name", nombre))))
                .andExpect(status().isCreated()));
        return UUID.fromString(creado.get("id").asText());
    }

    private void hacerMiembro(UUID householdId, String tokenAdmin, String tokenNuevo) throws Exception {
        String codigo = json(mockMvc.perform(get("/api/v1/households/" + householdId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenAdmin))
                .andExpect(status().isOk())).get("joinCode").asText();

        String solicitud = json(mockMvc.perform(post("/api/v1/join-requests")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenNuevo)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("joinCode", codigo))))
                .andExpect(status().isCreated())).get("id").asText();

        mockMvc.perform(post("/api/v1/households/" + householdId + "/join-requests/" + solicitud + ":approve")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenAdmin))
                .andExpect(status().isOk());
    }

    private UUID idDeUsuario(String email) {
        return users.findAll().stream()
                .filter(candidato -> candidato.getEmail().equalsIgnoreCase(email))
                .findFirst()
                .orElseThrow()
                .getId();
    }

    private JsonNode json(ResultActions actions) throws Exception {
        return objectMapper.readTree(actions.andReturn().getResponse().getContentAsString());
    }
}
