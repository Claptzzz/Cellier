package com.cellier.identity;

import com.cellier.PostgresTestcontainerConfig;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
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

import java.util.List;
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
 * Los hogares dentro del perfil, en las tres respuestas que lo llevan: {@code /me}, el inicio
 * de sesión y la renovación de tokens.
 *
 * <p>Lo que se comprueba aquí no es tanto que la lista aparezca, sino que <strong>esté
 * fresca</strong>: el rol no viaja dentro del access token precisamente para que no pueda
 * quedarse obsoleto, y estas respuestas son el canal por el que un cliente con la sesión
 * abierta se entera de que su situación cambió.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainerConfig.class)
@DisplayName("Hogares en el perfil")
class ProfileHouseholdsIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository users;

    @Autowired
    private RefreshTokenRepository refreshTokens;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @MockitoBean
    private GoogleTokenVerifier googleTokenVerifier;

    private String accessAna;
    private String refreshAna;
    private UUID idAna;
    private String accessBruno;
    private UUID idBruno;

    @BeforeEach
    void setUp() throws Exception {
        limpiar();

        stubGoogle("token-ana", "sub-ana", "ana.rivas@gmail.com", "Ana Rivas");
        stubGoogle("token-bruno", "sub-bruno", "bruno.soto@gmail.com", "Bruno Soto");

        JsonNode sesionAna = login("token-ana");
        accessAna = sesionAna.get("accessToken").asText();
        refreshAna = sesionAna.get("refreshToken").asText();
        accessBruno = login("token-bruno").get("accessToken").asText();

        idAna = idDeUsuario("ana.rivas@gmail.com");
        idBruno = idDeUsuario("bruno.soto@gmail.com");
    }

    // ---------------------------------------------------------------------------------
    // La lista, en las tres respuestas
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("La misma forma en /me, login y refresh")
    class MismaForma {

        @Test
        @DisplayName("quien no pertenece a ningún hogar recibe una lista vacía, no un null")
        void sinHogaresLaListaEstaVacia() throws Exception {
            mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.households").isArray())
                    .andExpect(jsonPath("$.households.length()").value(0));
        }

        @Test
        @DisplayName("/me lista el hogar con el rol y el tamaño del grupo, y sin el código de ingreso")
        void meListaLosHogares() throws Exception {
            UUID hogar = crearHogar(accessAna, "Casa Rivas");

            mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.households.length()").value(1))
                    .andExpect(jsonPath("$.households[0].id").value(hogar.toString()))
                    .andExpect(jsonPath("$.households[0].name").value("Casa Rivas"))
                    .andExpect(jsonPath("$.households[0].role").value("ADMIN"))
                    .andExpect(jsonPath("$.households[0].memberCount").value(1))
                    // El joinCode solo sale por el detalle del hogar.
                    .andExpect(jsonPath("$.households[0].joinCode").doesNotExist());
        }

        @Test
        @DisplayName("el inicio de sesión ya trae los hogares, sin una segunda llamada")
        void elLoginTraeLosHogares() throws Exception {
            crearHogar(accessAna, "Casa Rivas");

            JsonNode sesion = login("token-ana");

            assertThat(sesion.get("user").get("households")).hasSize(1);
            assertThat(sesion.get("user").get("households").get(0).get("name").asText())
                    .isEqualTo("Casa Rivas");
            assertThat(sesion.get("user").get("households").get(0).get("role").asText())
                    .isEqualTo("ADMIN");
        }

        @Test
        @DisplayName("PATCH /me devuelve el perfil actualizado sin perder los hogares")
        void patchMeConservaLosHogares() throws Exception {
            crearHogar(accessAna, "Casa Rivas");

            mockMvc.perform(patch("/api/v1/me")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"themePreference":"DARK"}"""))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.themePreference").value("DARK"))
                    .andExpect(jsonPath("$.households.length()").value(1));
        }

        @Test
        @DisplayName("solo salen los hogares propios")
        void cadaUnoVeLosSuyos() throws Exception {
            crearHogar(accessAna, "Casa Rivas");
            crearHogar(accessBruno, "Depa Ñuñoa");

            mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.households.length()").value(1))
                    .andExpect(jsonPath("$.households[0].name").value("Casa Rivas"));
            mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessBruno))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.households.length()").value(1))
                    .andExpect(jsonPath("$.households[0].name").value("Depa Ñuñoa"));
        }
    }

    // ---------------------------------------------------------------------------------
    // Frescura
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("La lista se relee, no se hereda de la sesión")
    class ListaFresca {

        @Test
        @DisplayName("a quien expulsan, su siguiente refresh ya no le lista el hogar")
        void trasLaExpulsionElRefreshYaNoLoLista() throws Exception {
            UUID hogar = crearHogar(accessAna, "Casa Rivas");
            hacerMiembro(hogar, accessAna, accessBruno);

            // Bruno abre sesión estando dentro: su token acredita al usuario, no al miembro.
            JsonNode sesionBruno = login("token-bruno");
            assertThat(sesionBruno.get("user").get("households")).hasSize(1);
            String refreshBruno = sesionBruno.get("refreshToken").asText();

            // Ana lo expulsa mientras la sesión de Bruno sigue abierta.
            mockMvc.perform(delete("/api/v1/households/" + hogar + "/members/" + idBruno)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna))
                    .andExpect(status().isNoContent());

            // El refresh es el momento en que Bruno se entera.
            JsonNode renovada = refrescar(refreshBruno);
            assertThat(renovada.get("user").get("households")).isEmpty();

            mockMvc.perform(get("/api/v1/me")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + renovada.get("accessToken").asText()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.households.length()").value(0));
        }

        @Test
        @DisplayName("a quien ascienden, su siguiente refresh ya le dice ADMIN")
        void trasElAscensoElRefreshLoRefleja() throws Exception {
            UUID hogar = crearHogar(accessAna, "Casa Rivas");
            hacerMiembro(hogar, accessAna, accessBruno);

            JsonNode sesionBruno = login("token-bruno");
            assertThat(sesionBruno.get("user").get("households").get(0).get("role").asText())
                    .isEqualTo("MEMBER");
            String refreshBruno = sesionBruno.get("refreshToken").asText();

            mockMvc.perform(patch("/api/v1/households/" + hogar + "/members/" + idBruno)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"role":"ADMIN"}"""))
                    .andExpect(status().isOk());

            assertThat(refrescar(refreshBruno).get("user").get("households").get(0).get("role").asText())
                    .isEqualTo("ADMIN");
        }

        @Test
        @DisplayName("el refresh de Ana refleja el hogar creado después de iniciar sesión")
        void elRefreshVeLoCreadoDespues() throws Exception {
            // La sesión de Ana se abrió en setUp, sin hogares.
            crearHogar(accessAna, "Casa Rivas");

            assertThat(refrescar(refreshAna).get("user").get("households")).hasSize(1);
        }

        @Test
        @DisplayName("el recuento de miembros del perfil sube cuando entra alguien")
        void elRecuentoSeActualiza() throws Exception {
            UUID hogar = crearHogar(accessAna, "Casa Rivas");

            mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.households[0].memberCount").value(1));

            hacerMiembro(hogar, accessAna, accessBruno);

            mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.households[0].memberCount").value(2));
        }
    }

    // ---------------------------------------------------------------------------------
    // Forma de las consultas y orden
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Consultas y orden")
    class ConsultasYOrden {

        @Test
        @DisplayName("/me cuesta dos sentencias tenga los hogares que tenga: el usuario y la lista")
        void meNoEsUnNMasUno() throws Exception {
            for (int i = 0; i < 6; i++) {
                crearHogar(accessAna, "Hogar " + i);
            }

            Statistics estadisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
            estadisticas.clear();

            mockMvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.households.length()").value(6));

            // Una para releer el usuario autenticado y otra para la lista completa, con el rol
            // del join y el recuento de una subconsulta. Ni lazy loading al serializar, ni 1+n.
            assertThat(estadisticas.getPrepareStatementCount()).isEqualTo(2);
        }

        @Test
        @DisplayName("el orden es el mismo entre llamadas y empieza por el primero alfabético")
        void ordenEstable() throws Exception {
            crearHogar(accessAna, "Zapallar");
            crearHogar(accessAna, "Ñuñoa");
            crearHogar(accessAna, "Arica");

            List<String> referencia = nombresDelPerfil();
            assertThat(referencia).hasSize(3).startsWith("Arica");

            // Dónde cae la Ñ depende del `collate` de la base; lo que se exige es estabilidad.
            for (int intento = 0; intento < 3; intento++) {
                assertThat(nombresDelPerfil()).containsExactlyElementsOf(referencia);
            }
        }

        private List<String> nombresDelPerfil() throws Exception {
            JsonNode perfil = json(mockMvc.perform(get("/api/v1/me")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessAna))
                    .andExpect(status().isOk()));
            return perfil.get("households").valueStream().map(h -> h.get("name").asText()).toList();
        }
    }

    // ---------------------------------------------------------------------------------
    // Utilidades
    // ---------------------------------------------------------------------------------

    private void limpiar() {
        // El orden importa: las solicitudes y las membresías cuelgan de los hogares, y los
        // hogares de los usuarios. Se limpian con SQL para no arrastrar aquí los repositorios
        // del módulo de hogares, que este test no necesita para nada más.
        var em = entityManagerFactory.createEntityManager();
        var tx = em.getTransaction();
        tx.begin();
        em.createNativeQuery("DELETE FROM join_requests").executeUpdate();
        em.createNativeQuery("DELETE FROM household_members").executeUpdate();
        em.createNativeQuery("DELETE FROM households").executeUpdate();
        tx.commit();
        em.close();
        refreshTokens.deleteAll();
        users.deleteAll();
    }

    private void stubGoogle(String idToken, String sub, String email, String nombre) {
        when(googleTokenVerifier.verify(idToken)).thenReturn(new GoogleIdentity(sub, email, nombre, null));
    }

    private JsonNode login(String idToken) throws Exception {
        return json(mockMvc.perform(post("/api/v1/auth/google")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("idToken", idToken))))
                .andExpect(status().isOk()));
    }

    private JsonNode refrescar(String refreshToken) throws Exception {
        return json(mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("refreshToken", refreshToken))))
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

    /** Mete a alguien en el hogar por el camino real: solicitar con el código y aprobar. */
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
