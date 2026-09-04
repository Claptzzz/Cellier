package com.cellier.household;

import com.cellier.PostgresTestcontainerConfig;
import com.cellier.household.domain.JoinRequestStatus;
import com.cellier.identity.GoogleIdentity;
import com.cellier.identity.GoogleTokenVerifier;
import com.cellier.identity.RefreshTokenRepository;
import com.cellier.identity.UserRepository;
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

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Solicitudes de ingreso: la puerta por la que se entra en un hogar.
 *
 * <p>El eje de estos tests es R3: <strong>conocer el código no da acceso</strong>. Por eso casi
 * todos comprueban las dos caras del mismo hecho —que antes de aprobar el hogar responde 404 y
 * que después responde 200—, en vez de limitarse a mirar el estado de la solicitud.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainerConfig.class)
@DisplayName("Solicitudes de ingreso")
class JoinRequestIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository users;

    @Autowired
    private RefreshTokenRepository refreshTokens;

    @Autowired
    private HouseholdRepository households;

    @Autowired
    private HouseholdMemberRepository members;

    @Autowired
    private JoinRequestRepository joinRequests;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @MockitoBean
    private GoogleTokenVerifier googleTokenVerifier;

    private String ana;
    private String bruno;
    private String carla;
    private UUID idBruno;

    /** Hogar de Ana, de la que es única administradora. */
    private UUID hogar;

    private String codigo;

    @BeforeEach
    void setUp() throws Exception {
        joinRequests.deleteAll();
        members.deleteAll();
        households.deleteAll();
        refreshTokens.deleteAll();
        users.deleteAll();

        stubGoogle("token-ana", "sub-ana", "ana.rivas@gmail.com", "Ana Rivas");
        stubGoogle("token-bruno", "sub-bruno", "bruno.soto@gmail.com", "Bruno Soto");
        stubGoogle("token-carla", "sub-carla", "carla.diaz@gmail.com", "Carla Díaz");

        ana = login("token-ana");
        bruno = login("token-bruno");
        carla = login("token-carla");
        idBruno = idDeUsuario("bruno.soto@gmail.com");

        JsonNode creado = json(crearHogar(ana, "Casa Rivas"));
        hogar = UUID.fromString(creado.get("id").asText());
        codigo = creado.get("joinCode").asText();
    }

    // ---------------------------------------------------------------------------------
    // R3 · el código no da acceso
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("R3 · el código abre una solicitud, no la puerta")
    class ElCodigoNoDaAcceso {

        @Test
        @DisplayName("enviar el código deja una solicitud PENDING y ninguna membresía")
        void enviarElCodigoNoConvierteEnMiembro() throws Exception {
            solicitar(bruno, codigo)
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.status").value("PENDING"))
                    .andExpect(jsonPath("$.householdId").value(hogar.toString()))
                    .andExpect(jsonPath("$.householdName").value("Casa Rivas"))
                    .andExpect(jsonPath("$.resolvedAt").doesNotExist());

            // Lo que importa: sigue sin ser miembro y el hogar sigue sin existir para él.
            assertThat(members.countByHouseholdId(hogar)).isEqualTo(1);
            mockMvc.perform(get("/api/v1/households/" + hogar).header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isNotFound());
            mockMvc.perform(get("/api/v1/households").header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(jsonPath("$.length()").value(0));
        }

        @Test
        @DisplayName("aprobar es lo que crea la membresía: 404 antes, 200 después")
        void aprobarEsLoQueAbreLaPuerta() throws Exception {
            UUID solicitud = idDe(solicitar(bruno, codigo));

            mockMvc.perform(get("/api/v1/households/" + hogar).header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isNotFound());

            aprobar(ana, solicitud)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("APPROVED"))
                    .andExpect(jsonPath("$.resolvedAt").isNotEmpty())
                    .andExpect(jsonPath("$.resolvedByUserId").value(idDeUsuario("ana.rivas@gmail.com").toString()));

            mockMvc.perform(get("/api/v1/households/" + hogar).header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.role").value("MEMBER"))
                    .andExpect(jsonPath("$.memberCount").value(2));
        }

        @Test
        @DisplayName("la bandeja del administrador trae el correo de quien pide entrar")
        void laBandejaIdentificaAlSolicitante() throws Exception {
            solicitar(bruno, codigo);

            mockMvc.perform(get(rutaBandeja()).header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].userId").value(idBruno.toString()))
                    .andExpect(jsonPath("$[0].displayName").value("Bruno Soto"))
                    .andExpect(jsonPath("$[0].email").value("bruno.soto@gmail.com"))
                    .andExpect(jsonPath("$[0].status").value("PENDING"));
        }

        @Test
        @DisplayName("rechazar no crea membresía y el hogar sigue siendo invisible")
        void rechazarNoAbreNada() throws Exception {
            UUID solicitud = idDe(solicitar(bruno, codigo));

            rechazar(ana, solicitud)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("REJECTED"))
                    .andExpect(jsonPath("$.resolvedAt").isNotEmpty());

            assertThat(members.countByHouseholdId(hogar)).isEqualTo(1);
            mockMvc.perform(get("/api/v1/households/" + hogar).header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("tras un rechazo se puede volver a solicitar")
        void trasElRechazoSePuedeReintentar() throws Exception {
            rechazar(ana, idDe(solicitar(bruno, codigo))).andExpect(status().isOk());

            solicitar(bruno, codigo).andExpect(status().isCreated());
            assertThat(joinRequests.count()).isEqualTo(2);
        }
    }

    // ---------------------------------------------------------------------------------
    // R5 · nada de solicitudes duplicadas
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("R5 · ni miembro dos veces, ni solicitudes duplicadas")
    class SinDuplicados {

        @Test
        @DisplayName("quien ya es miembro y envía el código recibe 409")
        void miembroQueReenviaElCodigoRecibe409() throws Exception {
            aprobar(ana, idDe(solicitar(bruno, codigo))).andExpect(status().isOk());

            solicitar(bruno, codigo)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.detail").value("Ya perteneces a ese hogar."));

            assertThat(joinRequests.count()).isEqualTo(1);
        }

        @Test
        @DisplayName("la administradora que envía el código de su propio hogar recibe 409")
        void laAdministradoraTambienEsMiembro() throws Exception {
            solicitar(ana, codigo)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.detail").value("Ya perteneces a ese hogar."));
        }

        @Test
        @DisplayName("una segunda solicitud pendiente al mismo hogar recibe 409")
        void solicitudDuplicadaRecibe409() throws Exception {
            solicitar(bruno, codigo).andExpect(status().isCreated());

            solicitar(bruno, codigo)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.detail").value(
                            "Ya tienes una solicitud pendiente en ese hogar. "
                                    + "Espera a que un administrador la resuelva, o cancélala."));

            assertThat(joinRequests.count()).isEqualTo(1);
        }
    }

    // ---------------------------------------------------------------------------------
    // Cancelación
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Cancelación")
    class Cancelacion {

        @Test
        @DisplayName("solicitar, cancelar y volver a solicitar al mismo hogar")
        void elCicloCompleto() throws Exception {
            UUID primera = idDe(solicitar(bruno, codigo).andExpect(status().isCreated()));

            mockMvc.perform(delete("/api/v1/join-requests/" + primera)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isNoContent());

            assertThat(joinRequests.findById(primera).orElseThrow().getStatus())
                    .isEqualTo(JoinRequestStatus.CANCELLED);

            // El índice único parcial queda libre: se puede volver a pedir.
            UUID segunda = idDe(solicitar(bruno, codigo).andExpect(status().isCreated()));

            assertThat(segunda).isNotEqualTo(primera);
            assertThat(joinRequests.count()).isEqualTo(2);
            assertThat(joinRequests.findById(segunda).orElseThrow().getStatus())
                    .isEqualTo(JoinRequestStatus.PENDING);
        }

        @Test
        @DisplayName("al cancelar queda constancia de quién la cerró: el propio solicitante")
        void cancelarDejaConstancia() throws Exception {
            UUID solicitud = idDe(solicitar(bruno, codigo));

            mockMvc.perform(delete("/api/v1/join-requests/" + solicitud)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isNoContent());

            var cancelada = joinRequests.findById(solicitud).orElseThrow();
            assertThat(cancelada.getResolvedAt()).isNotNull();
            assertThat(cancelada.getResolvedBy().getId()).isEqualTo(idBruno);
        }

        @Test
        @DisplayName("cancelar la solicitud de otro responde 404, no 403")
        void cancelarLaAjenaDa404() throws Exception {
            UUID solicitud = idDe(solicitar(bruno, codigo));

            mockMvc.perform(delete("/api/v1/join-requests/" + solicitud)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + carla))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.detail").value("No existe esa solicitud."));

            assertThat(joinRequests.findById(solicitud).orElseThrow().getStatus())
                    .isEqualTo(JoinRequestStatus.PENDING);
        }

        @Test
        @DisplayName("ni siquiera una administradora cancela la solicitud dirigida a su hogar")
        void laAdministradoraNoCancelaLaAjena() throws Exception {
            UUID solicitud = idDe(solicitar(bruno, codigo));

            mockMvc.perform(delete("/api/v1/join-requests/" + solicitud)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isNotFound());

            // Lo suyo es rechazarla, que deja otra huella.
            rechazar(ana, solicitud).andExpect(status().isOk());
        }

        @Test
        @DisplayName("cancelar una solicitud ya resuelta responde 409")
        void cancelarUnaResueltaDa409() throws Exception {
            UUID solicitud = idDe(solicitar(bruno, codigo));
            rechazar(ana, solicitud).andExpect(status().isOk());

            mockMvc.perform(delete("/api/v1/join-requests/" + solicitud)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.detail").value("Esa solicitud ya está resuelta."));
        }

        @Test
        @DisplayName("cancelar dos veces la misma responde 409 la segunda")
        void cancelarDosVecesDa409() throws Exception {
            UUID solicitud = idDe(solicitar(bruno, codigo));
            String comoBruno = "Bearer " + bruno;

            mockMvc.perform(delete("/api/v1/join-requests/" + solicitud).header(HttpHeaders.AUTHORIZATION, comoBruno))
                    .andExpect(status().isNoContent());
            mockMvc.perform(delete("/api/v1/join-requests/" + solicitud).header(HttpHeaders.AUTHORIZATION, comoBruno))
                    .andExpect(status().isConflict());
        }
    }

    // ---------------------------------------------------------------------------------
    // Resolver dos veces
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Una solicitud se resuelve una sola vez")
    class ResolverUnaSolaVez {

        @Test
        @DisplayName("aprobar dos veces responde 409 la segunda, y no duplica la membresía")
        void aprobarDosVecesDa409() throws Exception {
            UUID solicitud = idDe(solicitar(bruno, codigo));

            aprobar(ana, solicitud).andExpect(status().isOk());
            aprobar(ana, solicitud)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.detail").value("Esa solicitud ya está resuelta."));

            assertThat(members.countByHouseholdId(hogar)).isEqualTo(2);
        }

        @Test
        @DisplayName("rechazar una ya aprobada responde 409 y no deshace la membresía")
        void rechazarUnaAprobadaDa409() throws Exception {
            UUID solicitud = idDe(solicitar(bruno, codigo));
            aprobar(ana, solicitud).andExpect(status().isOk());

            rechazar(ana, solicitud).andExpect(status().isConflict());

            assertThat(members.findByHouseholdIdAndUserId(hogar, idBruno)).isPresent();
        }

        @Test
        @DisplayName("aprobar una que el solicitante ya canceló responde 409")
        void aprobarUnaCanceladaDa409() throws Exception {
            UUID solicitud = idDe(solicitar(bruno, codigo));
            mockMvc.perform(delete("/api/v1/join-requests/" + solicitud)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno)).andExpect(status().isNoContent());

            aprobar(ana, solicitud).andExpect(status().isConflict());

            assertThat(members.countByHouseholdId(hogar)).isEqualTo(1);
        }
    }

    // ---------------------------------------------------------------------------------
    // El código
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("El código de ingreso")
    class ElCodigo {

        @Test
        @DisplayName("se acepta en minúsculas y con espacios sobrantes")
        void seNormalizaAntesDeBuscarlo() throws Exception {
            solicitar(bruno, "  " + codigo.toLowerCase(java.util.Locale.ROOT) + "  ")
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.householdName").value("Casa Rivas"));
        }

        @Test
        @DisplayName("un código con caracteres ambiguos responde 400, no 404")
        void codigoConCaracteresAmbiguosDa400() throws Exception {
            solicitar(bruno, "O0IL1234")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors.joinCode").isNotEmpty());
        }

        @Test
        @DisplayName("un código ausente responde 400")
        void codigoAusenteDa400() throws Exception {
            mockMvc.perform(post("/api/v1/join-requests")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors.joinCode").isNotEmpty());
        }

        @Test
        @DisplayName("un código bien formado que no es de nadie responde 404")
        void codigoDesconocidoDa404() throws Exception {
            solicitar(bruno, "ZZZZ9999")
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.detail").value("No hay ningún hogar con ese código de ingreso."));
        }

        @Test
        @DisplayName("tras regenerarlo, el código anterior deja de servir")
        void elCodigoRegeneradoInvalidaAlAnterior() throws Exception {
            mockMvc.perform(post("/api/v1/households/" + hogar + "/join-code:regenerate")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk());

            solicitar(bruno, codigo).andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("regenerar el código no toca las solicitudes ya enviadas")
        void regenerarNoAfectaALasSolicitudesVivas() throws Exception {
            UUID solicitud = idDe(solicitar(bruno, codigo));

            mockMvc.perform(post("/api/v1/households/" + hogar + "/join-code:regenerate")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk());

            aprobar(ana, solicitud).andExpect(status().isOk());
            assertThat(members.findByHouseholdIdAndUserId(hogar, idBruno)).isPresent();
        }
    }

    // ---------------------------------------------------------------------------------
    // Permisos y aislamiento
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Permisos")
    class Permisos {

        @Test
        @DisplayName("un MEMBER no ve la bandeja ni resuelve nada: 403")
        void elMiembroNoResuelve() throws Exception {
            UUID deBruno = idDe(solicitar(bruno, codigo));
            aprobar(ana, deBruno).andExpect(status().isOk());
            UUID deCarla = idDe(solicitar(carla, codigo));

            String comoBruno = "Bearer " + bruno;
            mockMvc.perform(get(rutaBandeja()).header(HttpHeaders.AUTHORIZATION, comoBruno))
                    .andExpect(status().isForbidden());
            aprobar(bruno, deCarla).andExpect(status().isForbidden());
            rechazar(bruno, deCarla).andExpect(status().isForbidden());

            assertThat(members.countByHouseholdId(hogar)).isEqualTo(2);
        }

        @Test
        @DisplayName("quien no pertenece al hogar recibe 404 en la bandeja y al resolver")
        void elAjenoRecibe404() throws Exception {
            UUID solicitud = idDe(solicitar(bruno, codigo));
            String comoCarla = "Bearer " + carla;

            mockMvc.perform(get(rutaBandeja()).header(HttpHeaders.AUTHORIZATION, comoCarla))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.detail").value("No existe ese hogar, o no eres miembro de él."));
            aprobar(carla, solicitud).andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("una administradora no resuelve, desde su hogar, una solicitud de otro")
        void noSePuedeResolverLaSolicitudDeOtroHogar() throws Exception {
            UUID solicitud = idDe(solicitar(bruno, codigo));
            UUID otroHogar = UUID.fromString(json(crearHogar(ana, "Depa Ñuñoa")).get("id").asText());

            mockMvc.perform(post("/api/v1/households/" + otroHogar + "/join-requests/" + solicitud + ":approve")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.detail").value("No existe esa solicitud en este hogar."));

            assertThat(members.countByHouseholdId(hogar)).isEqualTo(1);
        }

        @Test
        @DisplayName("sin access token no se solicita ni se resuelve")
        void sinTokenDa401() throws Exception {
            mockMvc.perform(post("/api/v1/join-requests")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"joinCode":"ABCDEFGH"}"""))
                    .andExpect(status().isUnauthorized());
            mockMvc.perform(get("/api/v1/join-requests/mine")).andExpect(status().isUnauthorized());
            mockMvc.perform(get(rutaBandeja())).andExpect(status().isUnauthorized());
        }
    }

    // ---------------------------------------------------------------------------------
    // Listados
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Listados")
    class Listados {

        @Test
        @DisplayName("/mine trae solo las propias, de la más reciente a la más antigua")
        void misSolicitudes() throws Exception {
            UUID otroHogar = UUID.fromString(json(crearHogar(carla, "Depa Ñuñoa")).get("id").asText());
            String otroCodigo = json(mockMvc.perform(get("/api/v1/households/" + otroHogar)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + carla)))
                    .get("joinCode").asText();

            solicitar(bruno, codigo).andExpect(status().isCreated());
            solicitar(bruno, otroCodigo).andExpect(status().isCreated());

            mockMvc.perform(get("/api/v1/join-requests/mine").header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(2))
                    .andExpect(jsonPath("$[0].householdName").value("Depa Ñuñoa"))
                    .andExpect(jsonPath("$[1].householdName").value("Casa Rivas"));

            // Carla no ve las de Bruno.
            mockMvc.perform(get("/api/v1/join-requests/mine").header(HttpHeaders.AUTHORIZATION, "Bearer " + carla))
                    .andExpect(jsonPath("$.length()").value(0));
        }

        @Test
        @DisplayName("la bandeja sin filtro trae todas, con las pendientes primero")
        void bandejaSinFiltro() throws Exception {
            rechazar(ana, idDe(solicitar(bruno, codigo))).andExpect(status().isOk());
            solicitar(carla, codigo).andExpect(status().isCreated());

            mockMvc.perform(get(rutaBandeja()).header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(2))
                    .andExpect(jsonPath("$[0].status").value("PENDING"))
                    .andExpect(jsonPath("$[1].status").value("REJECTED"));
        }

        @Test
        @DisplayName("?status=PENDING deja fuera lo ya resuelto")
        void bandejaFiltrada() throws Exception {
            rechazar(ana, idDe(solicitar(bruno, codigo))).andExpect(status().isOk());
            solicitar(carla, codigo).andExpect(status().isCreated());

            mockMvc.perform(get(rutaBandeja() + "?status=PENDING")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].status").value("PENDING"));

            mockMvc.perform(get(rutaBandeja() + "?status=REJECTED")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].status").value("REJECTED"));
        }

        @Test
        @DisplayName("un estado que no existe responde 400")
        void estadoDesconocidoDa400() throws Exception {
            mockMvc.perform(get(rutaBandeja() + "?status=DUDOSA")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("la bandeja no es un N+1: una sentencia para el guardia y otra para los datos")
        void bandejaEnDosSentencias() throws Exception {
            solicitar(bruno, codigo).andExpect(status().isCreated());
            solicitar(carla, codigo).andExpect(status().isCreated());

            Statistics estadisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
            estadisticas.clear();

            mockMvc.perform(get(rutaBandeja()).header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(2));

            assertThat(estadisticas.getPrepareStatementCount()).isEqualTo(2);
        }
    }

    // ---------------------------------------------------------------------------------
    // Utilidades
    // ---------------------------------------------------------------------------------

    private String rutaBandeja() {
        return "/api/v1/households/" + hogar + "/join-requests";
    }

    private ResultActions solicitar(String accessToken, String joinCode) throws Exception {
        return mockMvc.perform(post("/api/v1/join-requests")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("joinCode", joinCode))));
    }

    private ResultActions aprobar(String accessToken, UUID joinRequestId) throws Exception {
        return mockMvc.perform(post(rutaBandeja() + "/" + joinRequestId + ":approve")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken));
    }

    private ResultActions rechazar(String accessToken, UUID joinRequestId) throws Exception {
        return mockMvc.perform(post(rutaBandeja() + "/" + joinRequestId + ":reject")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken));
    }

    private ResultActions crearHogar(String accessToken, String nombre) throws Exception {
        return mockMvc.perform(post("/api/v1/households")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("name", nombre))))
                .andExpect(status().isCreated());
    }

    private void stubGoogle(String idToken, String sub, String email, String nombre) {
        when(googleTokenVerifier.verify(idToken)).thenReturn(new GoogleIdentity(sub, email, nombre, null));
    }

    private String login(String idToken) throws Exception {
        String body = mockMvc.perform(post("/api/v1/auth/google")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("idToken", idToken))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("accessToken").asText();
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

    private UUID idDe(ResultActions actions) throws Exception {
        return UUID.fromString(json(actions).get("id").asText());
    }
}
