package com.cellier.household;

import com.cellier.PostgresTestcontainerConfig;
import com.cellier.household.domain.Household;
import com.cellier.household.domain.HouseholdMember;
import com.cellier.identity.GoogleIdentity;
import com.cellier.identity.GoogleTokenVerifier;
import com.cellier.identity.RefreshTokenRepository;
import com.cellier.identity.UserRepository;
import com.cellier.identity.domain.User;
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
import static org.hamcrest.Matchers.matchesPattern;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * El módulo de hogares contra un PostgreSQL real: migración, cascadas, índices y el guardia
 * de autorización tal como los ve un cliente HTTP.
 *
 * <p>Google se sustituye por un doble, igual que en el flujo de autenticación: aquí se prueba
 * qué puede hacer cada usuario con su token, no cómo se verifica un ID token.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainerConfig.class)
@DisplayName("Hogares")
class HouseholdIntegrationTest {

    /** Un identificador con forma válida que no corresponde a ningún hogar. */
    private static final UUID HOGAR_INEXISTENTE = UUID.fromString("00000000-0000-4000-8000-000000000000");

    private static final String CODIGO_VALIDO = "^[A-HJKMNP-Z2-9]{8}$";

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
    private EntityManagerFactory entityManagerFactory;

    @MockitoBean
    private GoogleTokenVerifier googleTokenVerifier;

    /** Ana crea hogares y los administra. */
    private String ana;

    /** Bruno es el intruso: existe y está autenticado, pero no pertenece a los hogares de Ana. */
    private String bruno;

    @BeforeEach
    void setUp() throws Exception {
        members.deleteAll();
        households.deleteAll();
        refreshTokens.deleteAll();
        users.deleteAll();

        stubGoogle("token-ana", "sub-ana", "ana.rivas@gmail.com", "Ana Rivas");
        stubGoogle("token-bruno", "sub-bruno", "bruno.soto@gmail.com", "Bruno Soto");

        ana = login("token-ana");
        bruno = login("token-bruno");
    }

    // ---------------------------------------------------------------------------------
    // R1: quien crea el hogar queda como ADMIN
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("R1 · el creador queda como administrador")
    class CreacionDelHogar {

        @Test
        @DisplayName("crear un hogar devuelve 201 con el creador como ADMIN y un solo miembro")
        void crearDejaAlCreadorComoAdmin() throws Exception {
            crear(ana, "Casa Rivas")
                    .andExpect(status().isCreated())
                    .andExpect(header().exists(HttpHeaders.LOCATION))
                    .andExpect(jsonPath("$.name").value("Casa Rivas"))
                    .andExpect(jsonPath("$.role").value("ADMIN"))
                    .andExpect(jsonPath("$.memberCount").value(1))
                    .andExpect(jsonPath("$.createdAt").isNotEmpty());

            assertThat(members.count()).isEqualTo(1);
            assertThat(members.findAll().getFirst().isAdmin()).isTrue();
        }

        @Test
        @DisplayName("la cabecera Location apunta al detalle del hogar recién creado")
        void locationApuntaAlDetalle() throws Exception {
            String location = crear(ana, "Casa Rivas")
                    .andReturn().getResponse().getHeader(HttpHeaders.LOCATION);

            mockMvc.perform(get(location).header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value("Casa Rivas"));
        }

        @Test
        @DisplayName("el hogar aparece en mi listado, con mi rol y el tamaño del grupo")
        void elHogarApareceEnMiListado() throws Exception {
            crear(ana, "Casa Rivas");

            mockMvc.perform(get("/api/v1/households").header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].name").value("Casa Rivas"))
                    .andExpect(jsonPath("$[0].role").value("ADMIN"))
                    .andExpect(jsonPath("$[0].memberCount").value(1));
        }

        @Test
        @DisplayName("el nombre se recorta antes de guardarlo")
        void elNombreSeRecorta() throws Exception {
            crear(ana, "   Casa Rivas   ")
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.name").value("Casa Rivas"));
        }

        @Test
        @DisplayName("un nombre en blanco responde 400 señalando el campo")
        void nombreEnBlancoDa400() throws Exception {
            crear(ana, "   ")
                    .andExpect(status().isBadRequest())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.errors.name").isNotEmpty());
        }

        @Test
        @DisplayName("un nombre de más de 80 caracteres responde 400")
        void nombreDemasiadoLargoDa400() throws Exception {
            crear(ana, "x".repeat(81))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors.name").isNotEmpty());
        }

        @Test
        @DisplayName("sin access token no se puede crear ni listar")
        void sinTokenDa401() throws Exception {
            mockMvc.perform(get("/api/v1/households"))
                    .andExpect(status().isUnauthorized());

            mockMvc.perform(post("/api/v1/households")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"name":"Casa Rivas"}"""))
                    .andExpect(status().isUnauthorized());
        }
    }

    // ---------------------------------------------------------------------------------
    // R2: código de ingreso
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("R2 · código de ingreso")
    class CodigoDeIngreso {

        @Test
        @DisplayName("el código generado tiene 8 caracteres y ninguno ambiguo")
        void formatoDelCodigo() throws Exception {
            crear(ana, "Casa Rivas")
                    .andExpect(jsonPath("$.joinCode").value(matchesPattern(CODIGO_VALIDO)));
        }

        @Test
        @DisplayName("dos hogares reciben códigos distintos")
        void codigosDistintosPorHogar() throws Exception {
            String primero = json(crear(ana, "Casa Rivas")).get("joinCode").asText();
            String segundo = json(crear(ana, "Depa Ñuñoa")).get("joinCode").asText();

            assertThat(primero).isNotEqualTo(segundo);
        }

        @Test
        @DisplayName("regenerar sustituye el código: el anterior deja de ser el del hogar")
        void regenerarSustituyeElCodigo() throws Exception {
            JsonNode hogar = json(crear(ana, "Casa Rivas"));
            UUID id = UUID.fromString(hogar.get("id").asText());
            String anterior = hogar.get("joinCode").asText();

            String nuevo = json(mockMvc.perform(post("/api/v1/households/" + id + "/join-code:regenerate")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.joinCode").value(matchesPattern(CODIGO_VALIDO))))
                    .get("joinCode").asText();

            assertThat(nuevo).isNotEqualTo(anterior);
            assertThat(households.findById(id).orElseThrow().getJoinCode()).isEqualTo(nuevo);
            assertThat(households.existsByJoinCode(anterior)).isFalse();
        }

        @Test
        @DisplayName("el código sale por el detalle del hogar, pero nunca por el listado")
        void elCodigoNoViajaEnElListado() throws Exception {
            UUID id = idDe(crear(ana, "Casa Rivas"));

            mockMvc.perform(get("/api/v1/households").header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].joinCode").doesNotExist());

            mockMvc.perform(get("/api/v1/households/" + id).header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.joinCode").isNotEmpty());
        }
    }

    // ---------------------------------------------------------------------------------
    // R7: borrado en cascada, solo por un administrador
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("R7 · eliminar el hogar")
    class BorradoDelHogar {

        @Test
        @DisplayName("un administrador borra el hogar y sus membresías caen en cascada")
        void borrarArrastraLasMembresias() throws Exception {
            UUID id = idDe(crear(ana, "Casa Rivas"));
            hacerMiembro(id, "bruno.soto@gmail.com");
            assertThat(members.count()).isEqualTo(2);

            mockMvc.perform(delete("/api/v1/households/" + id)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isNoContent());

            assertThat(households.count()).isZero();
            assertThat(members.count()).isZero();
        }

        @Test
        @DisplayName("tras borrarlo, el hogar responde 404 incluso a quien era administrador")
        void trasBorrarloEs404() throws Exception {
            UUID id = idDe(crear(ana, "Casa Rivas"));

            mockMvc.perform(delete("/api/v1/households/" + id)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isNoContent());

            mockMvc.perform(get("/api/v1/households/" + id)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("un miembro sin rol de administrador no puede borrarlo")
        void unMiembroNoPuedeBorrarlo() throws Exception {
            UUID id = idDe(crear(ana, "Casa Rivas"));
            hacerMiembro(id, "bruno.soto@gmail.com");

            mockMvc.perform(delete("/api/v1/households/" + id)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isForbidden());

            assertThat(households.count()).isEqualTo(1);
        }
    }

    // ---------------------------------------------------------------------------------
    // Aislamiento: un hogar ajeno no existe
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Aislamiento · un hogar ajeno responde 404, nunca 403")
    class Aislamiento {

        @Test
        @DisplayName("ver, renombrar, borrar y regenerar el hogar de otro dan todos 404")
        void todasLasOperacionesSobreUnHogarAjenoDan404() throws Exception {
            UUID id = idDe(crear(ana, "Casa Rivas"));
            String comoBruno = "Bearer " + bruno;

            mockMvc.perform(get("/api/v1/households/" + id).header(HttpHeaders.AUTHORIZATION, comoBruno))
                    .andExpect(status().isNotFound());

            mockMvc.perform(patch("/api/v1/households/" + id)
                            .header(HttpHeaders.AUTHORIZATION, comoBruno)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"name":"Secuestrado"}"""))
                    .andExpect(status().isNotFound());

            mockMvc.perform(delete("/api/v1/households/" + id).header(HttpHeaders.AUTHORIZATION, comoBruno))
                    .andExpect(status().isNotFound());

            mockMvc.perform(post("/api/v1/households/" + id + "/join-code:regenerate")
                            .header(HttpHeaders.AUTHORIZATION, comoBruno))
                    .andExpect(status().isNotFound());

            // Y nada de eso tocó el hogar.
            assertThat(households.findById(id).orElseThrow().getName()).isEqualTo("Casa Rivas");
        }

        @Test
        @DisplayName("el hogar de otro y un hogar inexistente responden exactamente lo mismo")
        void elHogarAjenoYElInexistenteSonIndistinguibles() throws Exception {
            UUID ajeno = idDe(crear(ana, "Casa Rivas"));
            String comoBruno = "Bearer " + bruno;

            JsonNode respuestaAjeno = json(mockMvc
                    .perform(get("/api/v1/households/" + ajeno).header(HttpHeaders.AUTHORIZATION, comoBruno))
                    .andExpect(status().isNotFound()));
            JsonNode respuestaInexistente = json(mockMvc
                    .perform(get("/api/v1/households/" + HOGAR_INEXISTENTE).header(HttpHeaders.AUTHORIZATION, comoBruno))
                    .andExpect(status().isNotFound()));

            // Si el texto delatara cuál de los dos existe, el 404 no protegería nada.
            assertThat(respuestaAjeno.get("detail")).isEqualTo(respuestaInexistente.get("detail"));
            assertThat(respuestaAjeno.get("title")).isEqualTo(respuestaInexistente.get("title"));
            assertThat(respuestaAjeno.get("type")).isEqualTo(respuestaInexistente.get("type"));
        }

        @Test
        @DisplayName("el listado de cada uno solo trae lo suyo")
        void cadaUnoVeSoloSusHogares() throws Exception {
            crear(ana, "Casa Rivas");
            crear(bruno, "Depa Ñuñoa");

            mockMvc.perform(get("/api/v1/households").header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].name").value("Casa Rivas"));

            mockMvc.perform(get("/api/v1/households").header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].name").value("Depa Ñuñoa"));
        }

        @Test
        @DisplayName("quien no pertenece a ningún hogar recibe una lista vacía, no un error")
        void sinHogaresLaListaEstaVacia() throws Exception {
            mockMvc.perform(get("/api/v1/households").header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(0));
        }
    }

    // ---------------------------------------------------------------------------------
    // Rol insuficiente: 403 para quien sí es miembro
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Rol · un MEMBER no administra")
    class RolInsuficiente {

        private UUID hogar;

        @BeforeEach
        void brunoEsMiembro() throws Exception {
            hogar = idDe(crear(ana, "Casa Rivas"));
            hacerMiembro(hogar, "bruno.soto@gmail.com");
        }

        @Test
        @DisplayName("renombrar responde 403, y el nombre no cambia")
        void renombrarDa403() throws Exception {
            mockMvc.perform(patch("/api/v1/households/" + hogar)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"name":"Casa Soto"}"""))
                    .andExpect(status().isForbidden())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.status").value(403))
                    .andExpect(jsonPath("$.detail").value("Esta operación requiere rol de administrador en el hogar."));

            assertThat(households.findById(hogar).orElseThrow().getName()).isEqualTo("Casa Rivas");
        }

        @Test
        @DisplayName("regenerar el código responde 403, y el código no cambia")
        void regenerarDa403() throws Exception {
            String antes = households.findById(hogar).orElseThrow().getJoinCode();

            mockMvc.perform(post("/api/v1/households/" + hogar + "/join-code:regenerate")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isForbidden());

            assertThat(households.findById(hogar).orElseThrow().getJoinCode()).isEqualTo(antes);
        }

        @Test
        @DisplayName("pero sí puede ver el hogar, con su rol MEMBER y el código para compartirlo")
        void verElHogarSiPuede() throws Exception {
            mockMvc.perform(get("/api/v1/households/" + hogar)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.role").value("MEMBER"))
                    .andExpect(jsonPath("$.memberCount").value(2))
                    .andExpect(jsonPath("$.joinCode").isNotEmpty());
        }

        @Test
        @DisplayName("un administrador sí renombra")
        void elAdministradorSiRenombra() throws Exception {
            mockMvc.perform(patch("/api/v1/households/" + hogar)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"name":"Casa Rivas Soto"}"""))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value("Casa Rivas Soto"))
                    .andExpect(jsonPath("$.memberCount").value(2));
        }
    }

    // ---------------------------------------------------------------------------------
    // Forma de las consultas
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Consultas")
    class FormaDeLasConsultas {

        @Test
        @DisplayName("listar mis hogares cuesta una sola sentencia, sean cuantos sean")
        void listarNoEsUnNMasUno() throws Exception {
            for (int i = 0; i < 5; i++) {
                crear(ana, "Hogar " + i);
            }

            Statistics estadisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
            estadisticas.clear();

            mockMvc.perform(get("/api/v1/households").header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(5));

            // El rol sale del join y el recuento de una subconsulta: una sentencia, no 1 + n.
            assertThat(estadisticas.getPrepareStatementCount()).isEqualTo(1);
        }

        @Test
        @DisplayName("el listado conserva el mismo orden entre llamadas, y empieza por el primero alfabético")
        void ordenEstable() throws Exception {
            crear(ana, "Zapallar");
            crear(ana, "Ñuñoa");
            crear(ana, "Arica");

            List<String> referencia = nombresListados();
            assertThat(referencia).hasSize(3).startsWith("Arica");

            // La estabilidad es el requisito: dónde cae la Ñ depende del `collate` de la base,
            // y fijarlo aquí probaría la configuración regional de PostgreSQL, no la consulta.
            for (int intento = 0; intento < 3; intento++) {
                assertThat(nombresListados()).containsExactlyElementsOf(referencia);
            }
        }

        private List<String> nombresListados() throws Exception {
            JsonNode lista = json(mockMvc
                    .perform(get("/api/v1/households").header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk()));
            return lista.valueStream().map(hogar -> hogar.get("name").asText()).toList();
        }
    }

    // ---------------------------------------------------------------------------------
    // Utilidades
    // ---------------------------------------------------------------------------------

    private void stubGoogle(String idToken, String sub, String email, String nombre) {
        when(googleTokenVerifier.verify(idToken)).thenReturn(new GoogleIdentity(sub, email, nombre, null));
    }

    /** Inicia sesión con el ID token de prueba y devuelve el access token. */
    private String login(String idToken) throws Exception {
        String body = mockMvc.perform(post("/api/v1/auth/google")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("idToken", idToken))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("accessToken").asText();
    }

    private ResultActions crear(String accessToken, String nombre) throws Exception {
        return mockMvc.perform(post("/api/v1/households")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", nombre))));
    }

    /**
     * Añade a alguien como MEMBER escribiendo la fila directamente.
     *
     * <p>Es una excepción consciente a probar por HTTP: la única vía de la API para llegar a
     * MEMBER es que un administrador apruebe una solicitud de ingreso, y ese camino aún no
     * existe. Cuando exista, estos casos podrán montarse con la API y este atajo sobrará.
     */
    private void hacerMiembro(UUID householdId, String email) {
        Household household = households.findById(householdId).orElseThrow();
        User user = users.findAll().stream()
                .filter(candidato -> candidato.getEmail().equalsIgnoreCase(email))
                .findFirst()
                .orElseThrow();
        members.save(HouseholdMember.member(household, user));
    }

    private JsonNode json(ResultActions actions) throws Exception {
        return objectMapper.readTree(actions.andReturn().getResponse().getContentAsString());
    }

    private UUID idDe(ResultActions creacion) throws Exception {
        return UUID.fromString(json(creacion).get("id").asText());
    }
}
