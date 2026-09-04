package com.cellier.household;

import com.cellier.PostgresTestcontainerConfig;
import com.cellier.household.domain.Household;
import com.cellier.household.domain.HouseholdMember;
import com.cellier.household.domain.HouseholdRole;
import com.cellier.household.dto.UpdateMemberRoleRequest;
import com.cellier.identity.CellierUserPrincipal;
import com.cellier.identity.GoogleIdentity;
import com.cellier.identity.GoogleTokenVerifier;
import com.cellier.identity.RefreshTokenRepository;
import com.cellier.identity.UserRepository;
import com.cellier.identity.domain.User;
import com.cellier.shared.error.ConflictException;
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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Membresía de los hogares: listar, cambiar rol, expulsar y salirse, con la invariante del
 * último administrador (R4) y la salida voluntaria (R6).
 *
 * <p>Ana crea el hogar, Bruno entra en él y Carla se queda fuera: con esos tres papeles se
 * cubren las tres respuestas que el módulo debe saber distinguir —404 para quien no pertenece,
 * 403 para quien pertenece sin rol, 409 para quien rompería la invariante—.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainerConfig.class)
@DisplayName("Miembros de un hogar")
class HouseholdMembershipIntegrationTest {

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
    private HouseholdMembershipService membership;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @MockitoBean
    private GoogleTokenVerifier googleTokenVerifier;

    private String tokenAna;
    private String tokenBruno;
    private String tokenCarla;
    private UUID idAna;
    private UUID idBruno;
    private UUID idCarla;

    /** Hogar de Ana, que es su única administradora. */
    private UUID hogar;

    /**
     * Repeticiones del escenario de carrera. Una sola tirada no basta para alcanzar la ventana
     * entre contar administradores y confirmar la transacción.
     */
    private static final int RONDAS_DE_CARRERA = 25;

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

        tokenAna = login("token-ana");
        tokenBruno = login("token-bruno");
        tokenCarla = login("token-carla");
        idAna = idDeUsuario("ana.rivas@gmail.com");
        idBruno = idDeUsuario("bruno.soto@gmail.com");
        idCarla = idDeUsuario("carla.diaz@gmail.com");

        hogar = crearHogar(tokenAna, "Casa Rivas");
    }

    // ---------------------------------------------------------------------------------
    // Listado
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Listado")
    class Listado {

        @Test
        @DisplayName("cualquier miembro puede listar, y los administradores salen primero")
        void listadoOrdenadoConAdministradoresPrimero() throws Exception {
            hacerMiembro(tokenBruno);

            mockMvc.perform(get(rutaMiembros()).header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenBruno))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(2))
                    .andExpect(jsonPath("$[0].role").value("ADMIN"))
                    .andExpect(jsonPath("$[0].displayName").value("Ana Rivas"))
                    .andExpect(jsonPath("$[0].email").value("ana.rivas@gmail.com"))
                    .andExpect(jsonPath("$[0].joinedAt").isNotEmpty())
                    .andExpect(jsonPath("$[1].role").value("MEMBER"))
                    .andExpect(jsonPath("$[1].displayName").value("Bruno Soto"));
        }

        @Test
        @DisplayName("quien no pertenece al hogar recibe 404, no la lista")
        void carlaNoVeLaLista() throws Exception {
            mockMvc.perform(get(rutaMiembros()).header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenCarla))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.detail").value("No existe ese hogar, o no eres miembro de él."));
        }

        @Test
        @DisplayName("listar cuesta una sola sentencia, sean cuantos sean los miembros")
        void listarNoEsUnNMasUno() throws Exception {
            hacerMiembro(tokenBruno);
            hacerMiembro(tokenCarla);

            Statistics estadisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
            estadisticas.clear();

            mockMvc.perform(get(rutaMiembros()).header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenAna))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(3));

            // Una para el guardia y otra para la proyección con los datos de perfil.
            assertThat(estadisticas.getPrepareStatementCount()).isEqualTo(2);
        }
    }

    // ---------------------------------------------------------------------------------
    // R4 · el hogar conserva siempre un administrador
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("R4 · siempre queda un administrador")
    class UltimoAdministrador {

        @Test
        @DisplayName("la única administradora no puede quitarse el rol: 409")
        void degradarAlUltimoAdminDa409() throws Exception {
            hacerMiembro(tokenBruno);

            cambiarRol(tokenAna, idAna, "MEMBER")
                    .andExpect(status().isConflict())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.title").value("Conflicto con el estado actual"))
                    .andExpect(jsonPath("$.detail").value(
                            "El hogar debe conservar al menos un administrador. "
                                    + "Promueve a otro miembro antes de quitarle el rol a este."));

            assertThat(rolDe(idAna)).isEqualTo(HouseholdRole.ADMIN);
        }

        @Test
        @DisplayName("la única administradora no puede salirse: 409, y sigue dentro")
        void salirSiendoElUltimoAdminDa409() throws Exception {
            hacerMiembro(tokenBruno);

            mockMvc.perform(delete(rutaMiembro(idAna)).header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenAna))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.detail").value(
                            "El hogar debe conservar al menos un administrador. "
                                    + "Promueve a otro miembro antes de salir, o elimina el hogar."));

            assertThat(members.findByHouseholdIdAndUserId(hogar, idAna)).isPresent();
        }

        @Test
        @DisplayName("con dos administradores, uno sí puede quitarse el rol; el que queda ya no")
        void conDosAdministradoresUnoPuedeDegradarse() throws Exception {
            hacerMiembro(tokenBruno);
            cambiarRol(tokenAna, idBruno, "ADMIN").andExpect(status().isOk());

            cambiarRol(tokenAna, idAna, "MEMBER")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.role").value("MEMBER"));

            // Ahora Bruno es el último: la puerta se cierra tras él.
            cambiarRol(tokenBruno, idBruno, "MEMBER").andExpect(status().isConflict());
            assertThat(rolDe(idBruno)).isEqualTo(HouseholdRole.ADMIN);
        }

        @Test
        @DisplayName("con dos administradores, uno puede expulsar al otro")
        void conDosAdministradoresUnoPuedeExpulsarAlOtro() throws Exception {
            hacerMiembro(tokenBruno);
            cambiarRol(tokenAna, idBruno, "ADMIN").andExpect(status().isOk());

            mockMvc.perform(delete(rutaMiembro(idBruno)).header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenAna))
                    .andExpect(status().isNoContent());

            assertThat(members.countByHouseholdIdAndRole(hogar, HouseholdRole.ADMIN)).isEqualTo(1);
        }

        @Test
        @DisplayName("asignar el rol que ya se tiene no rompe nada: 200, aunque sea el último admin")
        void reasignarElMismoRolEsIdempotente() throws Exception {
            cambiarRol(tokenAna, idAna, "ADMIN")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.role").value("ADMIN"));
        }

        /**
         * Ana y Bruno, ambos administradores, se quitan el rol a la vez en transacciones
         * distintas. Exactamente uno debe conseguirlo.
         *
         * <p>Se repite varias veces porque la ventana de la carrera —entre contar
         * administradores y confirmar la transacción— dura microsegundos, y una sola tirada
         * casi nunca la alcanza: con un único intento el test pasa igual aunque se quite el
         * bloqueo, y entonces no prueba nada. Con estas repeticiones, quitar
         * {@code lockHousehold} lo hace fallar.
         */
        @Test
        @DisplayName("dos degradaciones simultáneas no dejan al hogar sin administrador")
        void degradacionesSimultaneasNoVacianElHogar() throws Exception {
            ExecutorService pool = Executors.newFixedThreadPool(2);
            try {
                for (int ronda = 0; ronda < RONDAS_DE_CARRERA; ronda++) {
                    dejarDosAdministradores();

                    CyclicBarrier salida = new CyclicBarrier(2);
                    Future<String> unaAna = pool.submit(degradarse(idAna, "ana.rivas@gmail.com", salida));
                    Future<String> unBruno = pool.submit(degradarse(idBruno, "bruno.soto@gmail.com", salida));

                    List<String> resultados = List.of(unaAna.get(20, TimeUnit.SECONDS),
                            unBruno.get(20, TimeUnit.SECONDS));

                    assertThat(members.countByHouseholdIdAndRole(hogar, HouseholdRole.ADMIN))
                            .describedAs("ronda %d: el hogar se quedó sin administrador (%s)", ronda, resultados)
                            .isEqualTo(1);
                    assertThat(resultados)
                            .describedAs("ronda %d", ronda)
                            .containsExactlyInAnyOrder("ok", "conflicto");
                }
            } finally {
                pool.shutdownNow();
            }
        }

        /**
         * Deja el hogar con Ana y Bruno como administradores, venga del estado que venga.
         *
         * <p>Aquí sí se escriben las filas directamente, y no es el atajo que el resto de los
         * tests evita: no monta un estado inalcanzable —dos administradores se consiguen
         * promoviendo por la API— sino que lo restablece 25 veces seguidas dentro del bucle de
         * la carrera. Reconstruirlo por HTTP en cada ronda añadiría cinco peticiones por vuelta
         * al único test que mide una ventana de microsegundos.
         */
        private void dejarDosAdministradores() {
            members.deleteAll();
            Household household = households.findById(hogar).orElseThrow();
            members.save(HouseholdMember.admin(household, users.findById(idAna).orElseThrow()));
            members.save(HouseholdMember.admin(household, users.findById(idBruno).orElseThrow()));
        }

        /** Una tarea que se quita a sí misma el rol de administrador, en su propio hilo. */
        private Callable<String> degradarse(UUID userId, String email, CyclicBarrier salida) {
            return () -> {
                autenticarEnEsteHilo(userId, email);
                salida.await(20, TimeUnit.SECONDS);
                try {
                    membership.changeRole(hogar, userId, new UpdateMemberRoleRequest(HouseholdRole.MEMBER));
                    return "ok";
                } catch (ConflictException ex) {
                    return "conflicto";
                } finally {
                    SecurityContextHolder.clearContext();
                }
            };
        }
    }

    // ---------------------------------------------------------------------------------
    // R6 · salirse por cuenta propia
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("R6 · salirse del hogar")
    class SalidaVoluntaria {

        @Test
        @DisplayName("un miembro se sale solo y deja de ver el hogar")
        void elMiembroSeSaleSolo() throws Exception {
            hacerMiembro(tokenBruno);

            mockMvc.perform(delete(rutaMiembro(idBruno)).header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenBruno))
                    .andExpect(status().isNoContent());

            assertThat(members.findByHouseholdIdAndUserId(hogar, idBruno)).isEmpty();
            // Y desde fuera el hogar vuelve a no existir para él.
            mockMvc.perform(get("/api/v1/households/" + hogar)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenBruno))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("un administrador se sale solo si deja otro administrador detrás")
        void elAdministradorSeSaleSiQuedaOtro() throws Exception {
            hacerMiembro(tokenBruno);
            cambiarRol(tokenAna, idBruno, "ADMIN").andExpect(status().isOk());

            mockMvc.perform(delete(rutaMiembro(idAna)).header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenAna))
                    .andExpect(status().isNoContent());

            assertThat(members.findByHouseholdIdAndUserId(hogar, idAna)).isEmpty();
            assertThat(members.countByHouseholdIdAndRole(hogar, HouseholdRole.ADMIN)).isEqualTo(1);
        }

        @Test
        @DisplayName("salirse borra la membresía, no el hogar ni al resto")
        void salirseNoBorraElHogar() throws Exception {
            hacerMiembro(tokenBruno);

            mockMvc.perform(delete(rutaMiembro(idBruno)).header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenBruno))
                    .andExpect(status().isNoContent());

            assertThat(households.findById(hogar)).isPresent();
            assertThat(members.countByHouseholdId(hogar)).isEqualTo(1);
        }
    }

    // ---------------------------------------------------------------------------------
    // Permisos
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Permisos")
    class Permisos {

        @Test
        @DisplayName("un MEMBER no cambia roles ajenos: 403")
        void miembroNoCambiaRoles() throws Exception {
            hacerMiembro(tokenBruno);

            cambiarRol(tokenBruno, idAna, "MEMBER")
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.detail")
                            .value("Esta operación requiere rol de administrador en el hogar."));

            assertThat(rolDe(idAna)).isEqualTo(HouseholdRole.ADMIN);
        }

        @Test
        @DisplayName("un MEMBER tampoco se promueve a sí mismo: 403")
        void miembroNoSeAutopromociona() throws Exception {
            hacerMiembro(tokenBruno);

            cambiarRol(tokenBruno, idBruno, "ADMIN").andExpect(status().isForbidden());

            assertThat(rolDe(idBruno)).isEqualTo(HouseholdRole.MEMBER);
        }

        @Test
        @DisplayName("un MEMBER no expulsa a nadie: 403, aunque el hogar sí exista para él")
        void miembroNoExpulsa() throws Exception {
            hacerMiembro(tokenBruno);
            hacerMiembro(tokenCarla);

            mockMvc.perform(delete(rutaMiembro(idCarla)).header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenBruno))
                    .andExpect(status().isForbidden());

            assertThat(members.findByHouseholdIdAndUserId(hogar, idCarla)).isPresent();
        }

        @Test
        @DisplayName("un administrador expulsa a un miembro: 204")
        void elAdministradorExpulsa() throws Exception {
            hacerMiembro(tokenBruno);

            mockMvc.perform(delete(rutaMiembro(idBruno)).header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenAna))
                    .andExpect(status().isNoContent());

            assertThat(members.findByHouseholdIdAndUserId(hogar, idBruno)).isEmpty();
        }

        @Test
        @DisplayName("quien no pertenece al hogar recibe 404 en todo, nunca 403")
        void carlaSoloRecibe404() throws Exception {
            String comoCarla = "Bearer " + tokenCarla;

            mockMvc.perform(get(rutaMiembros()).header(HttpHeaders.AUTHORIZATION, comoCarla))
                    .andExpect(status().isNotFound());
            mockMvc.perform(patch(rutaMiembro(idAna))
                            .header(HttpHeaders.AUTHORIZATION, comoCarla)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"role":"MEMBER"}"""))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.detail").value("No existe ese hogar, o no eres miembro de él."));
            mockMvc.perform(delete(rutaMiembro(idAna)).header(HttpHeaders.AUTHORIZATION, comoCarla))
                    .andExpect(status().isNotFound());

            assertThat(rolDe(idAna)).isEqualTo(HouseholdRole.ADMIN);
        }
    }

    // ---------------------------------------------------------------------------------
    // La persona indicada
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("La persona indicada")
    class PersonaIndicada {

        @Test
        @DisplayName("cambiar el rol de alguien ajeno al hogar responde 404 con su propio detalle")
        void cambiarRolDeAlguienAjenoDa404() throws Exception {
            cambiarRol(tokenAna, idCarla, "ADMIN")
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.detail").value("Esa persona no pertenece a este hogar."));
        }

        @Test
        @DisplayName("expulsar a alguien ajeno al hogar responde 404")
        void expulsarAAlguienAjenoDa404() throws Exception {
            mockMvc.perform(delete(rutaMiembro(idCarla)).header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenAna))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.detail").value("Esa persona no pertenece a este hogar."));
        }

        @Test
        @DisplayName("un rol ausente o desconocido responde 400")
        void rolInvalidoDa400() throws Exception {
            hacerMiembro(tokenBruno);

            mockMvc.perform(patch(rutaMiembro(idBruno))
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenAna)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors.role").isNotEmpty());

            mockMvc.perform(patch(rutaMiembro(idBruno))
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenAna)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"role":"DUENO"}"""))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("sin access token no se toca la membresía")
        void sinTokenDa401() throws Exception {
            mockMvc.perform(get(rutaMiembros())).andExpect(status().isUnauthorized());
            mockMvc.perform(delete(rutaMiembro(idAna))).andExpect(status().isUnauthorized());
        }
    }

    // ---------------------------------------------------------------------------------
    // Utilidades
    // ---------------------------------------------------------------------------------

    private String rutaMiembros() {
        return "/api/v1/households/" + hogar + "/members";
    }

    private String rutaMiembro(UUID userId) {
        return rutaMiembros() + "/" + userId;
    }

    private ResultActions cambiarRol(String accessToken, UUID userId, String rol) throws Exception {
        return mockMvc.perform(patch(rutaMiembro(userId))
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("role", rol))));
    }

    private HouseholdRole rolDe(UUID userId) {
        return members.findByHouseholdIdAndUserId(hogar, userId).orElseThrow().getRole();
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

    private UUID crearHogar(String accessToken, String nombre) throws Exception {
        String body = mockMvc.perform(post("/api/v1/households")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("name", nombre))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        JsonNode json = objectMapper.readTree(body);
        return UUID.fromString(json.get("id").asText());
    }

    private UUID idDeUsuario(String email) {
        return usuario(email).getId();
    }

    private User usuario(String email) {
        return users.findAll().stream()
                .filter(candidato -> candidato.getEmail().equalsIgnoreCase(email))
                .findFirst()
                .orElseThrow();
    }

    /**
     * Mete a alguien en el hogar por el camino real: solicita con el código y Ana, que lo
     * administra, aprueba. El estado de partida es uno al que se llega por la API.
     */
    private void hacerMiembro(String tokenNuevo) throws Exception {
        String codigo = json(mockMvc.perform(get("/api/v1/households/" + hogar)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenAna))
                        .andExpect(status().isOk()))
                .get("joinCode").asText();

        String solicitud = json(mockMvc.perform(post("/api/v1/join-requests")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenNuevo)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("joinCode", codigo))))
                        .andExpect(status().isCreated()))
                .get("id").asText();

        mockMvc.perform(post("/api/v1/households/" + hogar + "/join-requests/" + solicitud + ":approve")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenAna))
                .andExpect(status().isOk());
    }

    private JsonNode json(ResultActions actions) throws Exception {
        return objectMapper.readTree(actions.andReturn().getResponse().getContentAsString());
    }

    /** Coloca la identidad en el SecurityContext del hilo actual, como haría el filtro JWT. */
    private void autenticarEnEsteHilo(UUID userId, String email) {
        SecurityContext contexto = SecurityContextHolder.createEmptyContext();
        contexto.setAuthentication(new UsernamePasswordAuthenticationToken(
                new CellierUserPrincipal(userId, email), null, List.of()));
        SecurityContextHolder.setContext(contexto);
    }
}
