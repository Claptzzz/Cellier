package com.cellier.pantry;

import com.cellier.PostgresTestcontainerConfig;
import com.cellier.catalog.ProductRepository;
import com.cellier.household.HouseholdMemberRepository;
import com.cellier.household.HouseholdRepository;
import com.cellier.household.JoinRequestRepository;
import com.cellier.identity.CellierUserPrincipal;
import com.cellier.identity.GoogleIdentity;
import com.cellier.identity.GoogleTokenVerifier;
import com.cellier.identity.RefreshTokenRepository;
import com.cellier.identity.UserRepository;
import com.cellier.pantry.domain.MovementType;
import com.cellier.pantry.domain.StockMovement;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.dao.OptimisticLockingFailureException;
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

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Las mutaciones de la despensa contra un PostgreSQL real.
 *
 * <p>El invariante que vertebra casi todos los casos: <strong>la suma de los movimientos de
 * un artículo es su cantidad actual</strong>. Si consumir registrara lo que se pidió en vez
 * de lo que había, o un ajuste sin cambio escribiera una fila de cero, el historial dejaría
 * de explicar la cifra.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainerConfig.class)
@DisplayName("Despensa · mutaciones")
class PantryMutationsIntegrationTest {

    /**
     * Rondas del escenario de carrera. Con una sola tirada la colisión casi nunca se da y el
     * test pasaría igual sin bloqueo optimista, que es exactamente el fallo que ya costó una
     * revisión en el módulo de hogares.
     */
    private static final int RONDAS_DE_CARRERA = 15;

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
    private ProductRepository products;

    @Autowired
    private PantryItemRepository items;

    @Autowired
    private StockMovementRepository movements;

    @Autowired
    private PantryService pantry;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @MockitoBean
    private GoogleTokenVerifier googleTokenVerifier;

    private String ana;
    private String bruno;
    private UUID idAna;
    private UUID casaRivas;
    private UUID hogarDeBruno;

    @BeforeEach
    void setUp() throws Exception {
        limpiar();

        stubGoogle("token-ana", "sub-ana", "ana.rivas@gmail.com", "Ana Rivas");
        stubGoogle("token-bruno", "sub-bruno", "bruno.soto@gmail.com", "Bruno Soto");
        ana = login("token-ana");
        bruno = login("token-bruno");
        idAna = users.findAll().stream()
                .filter((u) -> u.getEmail().equalsIgnoreCase("ana.rivas@gmail.com"))
                .findFirst().orElseThrow().getId();

        casaRivas = crearHogar(ana, "Casa Rivas");
        hogarDeBruno = crearHogar(bruno, "Depa Ñuñoa");
    }

    // ---------------------------------------------------------------------------------
    // Alta
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Alta")
    class Alta {

        @Test
        @DisplayName("con un nombre nuevo crea el producto y el artículo en una transacción")
        void creaProductoYArticulo() throws Exception {
            anadirPorNombre(ana, casaRivas, "Salsa de tomate", "ML", "690")
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.product.name").value("Salsa de tomate"))
                    .andExpect(jsonPath("$.product.unit").value("ML"))
                    .andExpect(jsonPath("$.quantity").value(690.000))
                    .andExpect(jsonPath("$.version").value(0));

            assertThat(products.count()).isEqualTo(1);
            assertThat(items.count()).isEqualTo(1);
        }

        @Test
        @DisplayName("un nombre existente en otra capitalización reutiliza el producto")
        void reutilizaElProductoIgnorandoMayusculas() throws Exception {
            anadirPorNombre(ana, casaRivas, "Lechuga", "UNIT", "2").andExpect(status().isCreated());
            // Se saca de la despensa para poder volver a añadirlo; el producto sigue en el catálogo.
            UUID item = items.findAll().getFirst().getId();
            mockMvc.perform(delete(ruta(casaRivas) + "/" + item)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isNoContent());

            anadirPorNombre(ana, casaRivas, "LECHUGA", "UNIT", "3").andExpect(status().isCreated());

            assertThat(products.count()).isEqualTo(1);
        }

        @Test
        @DisplayName("el mismo nombre con otra unidad responde 409 diciendo las dos")
        void unidadDistintaDa409() throws Exception {
            anadirPorNombre(ana, casaRivas, "Leche", "L", "2").andExpect(status().isCreated());
            UUID item = items.findAll().getFirst().getId();
            mockMvc.perform(delete(ruta(casaRivas) + "/" + item)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana)).andExpect(status().isNoContent());

            anadirPorNombre(ana, casaRivas, "leche", "G", "500")
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.detail").value(
                            "«Leche» ya existe en este hogar medido en L, y lo estás enviando en G. "
                                    + "Usa L, o crea un producto con otro nombre."));

            assertThat(products.count()).isEqualTo(1);
        }

        @Test
        @DisplayName("el mismo producto dos veces en la despensa responde 409")
        void mismoProductoDosVeces() throws Exception {
            anadirPorNombre(ana, casaRivas, "Huevos", "UNIT", "12").andExpect(status().isCreated());

            anadirPorNombre(ana, casaRivas, "Huevos", "UNIT", "6")
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("ya está en la despensa")));

            assertThat(items.count()).isEqualTo(1);
        }

        @Test
        @DisplayName("el alta con cantidad registra la entrada; con cero no registra nada")
        void elAltaRegistraLaEntrada() throws Exception {
            UUID conCantidad = idDe(anadirPorNombre(ana, casaRivas, "Huevos", "UNIT", "12"));
            UUID sinCantidad = idDe(anadirPorNombre(ana, casaRivas, "Lechuga", "UNIT", "0"));

            assertThat(movements.countByItemId(conCantidad)).isEqualTo(1);
            assertThat(movements.countByItemId(sinCantidad)).isZero();
            assertThat(sumaDeMovimientos(conCantidad)).isEqualByComparingTo("12.000");
        }

        @Test
        @DisplayName("un artículo recién creado nace en la versión 0, aunque traiga todos los campos")
        void naceEnLaVersionCero() throws Exception {
            // Rellenar el artículo DESPUÉS de guardarlo provocaba un INSERT más un UPDATE, y
            // nacía en la versión 1: un recién creado que ya parecía modificado por alguien.
            var cuerpo = new LinkedHashMap<String, Object>();
            cuerpo.put("productName", "Salsa de tomate");
            cuerpo.put("unit", "ML");
            cuerpo.put("quantity", "690");
            cuerpo.put("expiresAt", "2026-10-04");
            cuerpo.put("parLevel", "1000");
            cuerpo.put("storageLocation", "PANTRY");

            mockMvc.perform(post(ruta(casaRivas))
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(cuerpo)))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.version").value(0))
                    .andExpect(jsonPath("$.expiresAt").value("2026-10-04"))
                    .andExpect(jsonPath("$.parLevel").value(1000.000))
                    .andExpect(jsonPath("$.storageLocation").value("PANTRY"));
        }

        @Test
        @DisplayName("una cantidad negativa responde 400")
        void cantidadNegativaDa400() throws Exception {
            anadirPorNombre(ana, casaRivas, "Huevos", "UNIT", "-1")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors.quantity").isNotEmpty());
        }
    }

    // ---------------------------------------------------------------------------------
    // Consumo
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Consumo")
    class Consumo {

        @Test
        @DisplayName("consumir más de lo que hay deja cero y registra sólo lo que había")
        void consumirDeMasDejaCero() throws Exception {
            UUID item = idDe(anadirPorNombre(ana, casaRivas, "Huevos", "UNIT", "5"));

            mover(ana, casaRivas, item, "consume", "8")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.quantity").value(0.000));

            // El movimiento registra 5, no 8: la suma de movimientos tiene que seguir siendo
            // la cantidad, y de 8 sólo se pudieron gastar 5.
            List<StockMovement> historial = movimientosDe(item);
            assertThat(historial).hasSize(2);
            assertThat(historial.get(1).getType()).isEqualTo(MovementType.CONSUMPTION);
            assertThat(historial.get(1).getDelta()).isEqualByComparingTo("-5.000");
            assertThat(sumaDeMovimientos(item)).isEqualByComparingTo("0.000");
        }

        @Test
        @DisplayName("consumir parte deja el resto y registra el consumo exacto")
        void consumirParte() throws Exception {
            UUID item = idDe(anadirPorNombre(ana, casaRivas, "Salsa de tomate", "ML", "690"));

            mover(ana, casaRivas, item, "consume", "240")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.quantity").value(450.000));

            assertThat(sumaDeMovimientos(item)).isEqualByComparingTo("450.000");
        }

        @Test
        @DisplayName("consumir de un artículo vacío no registra movimiento")
        void consumirDeVacioNoRegistraNada() throws Exception {
            UUID item = idDe(anadirPorNombre(ana, casaRivas, "Lechuga", "UNIT", "0"));

            mover(ana, casaRivas, item, "consume", "1")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.quantity").value(0.000));

            assertThat(movements.countByItemId(item)).isZero();
        }

        @Test
        @DisplayName("consumir cero o negativo responde 400")
        void cantidadInvalidaDa400() throws Exception {
            UUID item = idDe(anadirPorNombre(ana, casaRivas, "Huevos", "UNIT", "5"));

            mover(ana, casaRivas, item, "consume", "0").andExpect(status().isBadRequest());
            mover(ana, casaRivas, item, "consume", "-2")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors.quantity").isNotEmpty());
        }
    }

    // ---------------------------------------------------------------------------------
    // Reposición y ajuste
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Reposición y ajuste")
    class ReposicionYAjuste {

        @Test
        @DisplayName("reponer suma y registra una entrada")
        void reponer() throws Exception {
            UUID item = idDe(anadirPorNombre(ana, casaRivas, "Huevos", "UNIT", "6"));

            mover(ana, casaRivas, item, "restock", "12")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.quantity").value(18.000));

            assertThat(movimientosDe(item).get(1).getType()).isEqualTo(MovementType.PURCHASE);
            assertThat(sumaDeMovimientos(item)).isEqualByComparingTo("18.000");
        }

        @Test
        @DisplayName("fijar la cantidad a mano registra un ajuste con la diferencia")
        void ajustar() throws Exception {
            UUID item = idDe(anadirPorNombre(ana, casaRivas, "Salsa de tomate", "ML", "690"));

            editar(ana, casaRivas, item, Map.of("quantity", "500"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.quantity").value(500.000));

            StockMovement ajuste = movimientosDe(item).get(1);
            assertThat(ajuste.getType()).isEqualTo(MovementType.ADJUSTMENT);
            assertThat(ajuste.getDelta()).isEqualByComparingTo("-190.000");
            assertThat(sumaDeMovimientos(item)).isEqualByComparingTo("500.000");
        }

        @Test
        @DisplayName("un ajuste a la misma cantidad no registra movimiento")
        void ajusteSinCambioNoRegistraNada() throws Exception {
            UUID item = idDe(anadirPorNombre(ana, casaRivas, "Huevos", "UNIT", "12"));

            editar(ana, casaRivas, item, Map.of("quantity", "12")).andExpect(status().isOk());

            // Sólo el alta. Un movimiento de cero no es un movimiento, y la base lo
            // rechazaría con ck_stock_movements_sign.
            assertThat(movements.countByItemId(item)).isEqualTo(1);
        }

        @Test
        @DisplayName("editar vencimiento, nivel objetivo y ubicación no toca la cantidad")
        void editarLoDemas() throws Exception {
            UUID item = idDe(anadirPorNombre(ana, casaRivas, "Huevos", "UNIT", "12"));

            editar(ana, casaRivas, item, Map.of(
                            "expiresAt", "2026-09-25", "parLevel", "24", "storageLocation", "FRIDGE"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.expiresAt").value("2026-09-25"))
                    .andExpect(jsonPath("$.parLevel").value(24.000))
                    .andExpect(jsonPath("$.storageLocation").value("FRIDGE"))
                    .andExpect(jsonPath("$.quantity").value(12.000));

            assertThat(movements.countByItemId(item)).isEqualTo(1);
        }

        @Test
        @DisplayName("cada modificación sube la versión del artículo")
        void laVersionSube() throws Exception {
            UUID item = idDe(anadirPorNombre(ana, casaRivas, "Huevos", "UNIT", "12"));

            mover(ana, casaRivas, item, "consume", "2")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.version").value(1));
            mover(ana, casaRivas, item, "restock", "6")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.version").value(2));
        }
    }

    // ---------------------------------------------------------------------------------
    // Concurrencia
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Concurrencia")
    class Concurrencia {

        /**
         * Dos consumos simultáneos sobre el mismo artículo. Uno gana y el otro recibe una
         * colisión; nunca se pierde una escritura en silencio.
         *
         * <p>Sin {@code @Version}, ambos leen la misma cantidad, ambos escriben, y el segundo
         * pisa al primero: se registran dos movimientos pero la cantidad sólo refleja uno, y
         * el historial deja de cuadrar. Por eso se comprueban las tres cosas —resultados,
         * cantidad final y número de movimientos—, no sólo que alguien fallara.
         */
        @Test
        @DisplayName("dos consumos a la vez: uno gana, el otro recibe conflicto")
        void consumosSimultaneos() throws Exception {
            ExecutorService pool = Executors.newFixedThreadPool(2);
            try {
                for (int ronda = 0; ronda < RONDAS_DE_CARRERA; ronda++) {
                    UUID item = idDe(anadirPorNombre(
                            ana, casaRivas, "Huevos ronda " + ronda, "UNIT", "10"));

                    CyclicBarrier salida = new CyclicBarrier(2);
                    Future<String> primero = pool.submit(consumir(item, salida));
                    Future<String> segundo = pool.submit(consumir(item, salida));

                    List<String> resultados = List.of(
                            primero.get(20, TimeUnit.SECONDS), segundo.get(20, TimeUnit.SECONDS));

                    assertThat(resultados)
                            .describedAs("ronda %d", ronda)
                            .containsExactlyInAnyOrder("ok", "conflicto");
                    assertThat(items.findById(item).orElseThrow().getQuantity())
                            .describedAs("ronda %d: sólo un consumo debió aplicarse", ronda)
                            .isEqualByComparingTo("7.000");
                    assertThat(movements.countByItemId(item))
                            .describedAs("ronda %d: el alta más un consumo", ronda)
                            .isEqualTo(2);
                }
            } finally {
                pool.shutdownNow();
            }
        }

        /** Gasta 3 del artículo, en su propio hilo y su propia transacción. */
        private Callable<String> consumir(UUID item, CyclicBarrier salida) {
            return () -> {
                autenticarEnEsteHilo();
                salida.await(20, TimeUnit.SECONDS);
                try {
                    pantry.consume(casaRivas, item, new BigDecimal("3"));
                    return "ok";
                } catch (OptimisticLockingFailureException ex) {
                    return "conflicto";
                } finally {
                    SecurityContextHolder.clearContext();
                }
            };
        }
    }

    // ---------------------------------------------------------------------------------
    // Aislamiento
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Aislamiento entre hogares")
    class Aislamiento {

        @Test
        @DisplayName("todos los endpoints de la despensa de un hogar ajeno responden 404")
        void hogarAjeno() throws Exception {
            UUID item = idDe(anadirPorNombre(ana, casaRivas, "Huevos", "UNIT", "12"));
            String comoBruno = "Bearer " + bruno;

            anadirPorNombre(bruno, casaRivas, "Intruso", "UNIT", "1").andExpect(status().isNotFound());
            editar(bruno, casaRivas, item, Map.of("quantity", "0")).andExpect(status().isNotFound());
            mover(bruno, casaRivas, item, "consume", "1").andExpect(status().isNotFound());
            mover(bruno, casaRivas, item, "restock", "1").andExpect(status().isNotFound());
            mockMvc.perform(delete(ruta(casaRivas) + "/" + item).header(HttpHeaders.AUTHORIZATION, comoBruno))
                    .andExpect(status().isNotFound());

            assertThat(items.findById(item).orElseThrow().getQuantity()).isEqualByComparingTo("12.000");
        }

        @Test
        @DisplayName("un artículo de otro hogar no se alcanza desde el hogar propio")
        void articuloAjenoDesdeElPropio() throws Exception {
            UUID deAna = idDe(anadirPorNombre(ana, casaRivas, "Huevos", "UNIT", "12"));

            mover(bruno, hogarDeBruno, deAna, "consume", "1")
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.detail").value(
                            "No existe ese artículo en la despensa de este hogar."));
        }

        @Test
        @DisplayName("un producto de otro hogar no se puede meter en la despensa propia")
        void productoAjenoEnDespensaPropia() throws Exception {
            anadirPorNombre(ana, casaRivas, "Huevos", "UNIT", "12").andExpect(status().isCreated());
            UUID productoDeAna = products.findAll().getFirst().getId();

            var cuerpo = new LinkedHashMap<String, Object>();
            cuerpo.put("productId", productoDeAna.toString());
            cuerpo.put("quantity", "5");

            mockMvc.perform(post(ruta(hogarDeBruno))
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(cuerpo)))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.detail").value("No existe ese producto en este hogar."));
        }

        @Test
        @DisplayName("sin access token no se toca la despensa")
        void sinTokenDa401() throws Exception {
            mockMvc.perform(post(ruta(casaRivas))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"productName":"Huevos","unit":"UNIT","quantity":1}"""))
                    .andExpect(status().isUnauthorized());
        }
    }

    // ---------------------------------------------------------------------------------
    // Utilidades
    // ---------------------------------------------------------------------------------

    private String ruta(UUID householdId) {
        return "/api/v1/households/" + householdId + "/pantry/items";
    }

    private ResultActions anadirPorNombre(String token, UUID householdId, String nombre,
                                          String unidad, String cantidad) throws Exception {
        var cuerpo = new LinkedHashMap<String, Object>();
        cuerpo.put("productName", nombre);
        cuerpo.put("unit", unidad);
        cuerpo.put("quantity", cantidad);
        return mockMvc.perform(post(ruta(householdId))
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(cuerpo)));
    }

    private ResultActions mover(String token, UUID householdId, UUID itemId,
                                String accion, String cantidad) throws Exception {
        return mockMvc.perform(post(ruta(householdId) + "/" + itemId + ":" + accion)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("quantity", cantidad))));
    }

    private ResultActions editar(String token, UUID householdId, UUID itemId,
                                 Map<String, Object> cambios) throws Exception {
        return mockMvc.perform(patch(ruta(householdId) + "/" + itemId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(cambios)));
    }

    private List<StockMovement> movimientosDe(UUID itemId) {
        List<StockMovement> encontrados = new ArrayList<>(
                movements.findAll().stream()
                        .filter((m) -> m.getItem().getId().equals(itemId))
                        .toList());
        encontrados.sort(java.util.Comparator.comparing(StockMovement::getPerformedAt)
                .thenComparing(StockMovement::getId));
        return encontrados;
    }

    /** El invariante: la suma de los movimientos de un artículo es su cantidad. */
    private BigDecimal sumaDeMovimientos(UUID itemId) {
        return movimientosDe(itemId).stream()
                .map(StockMovement::getDelta)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private void autenticarEnEsteHilo() {
        SecurityContext contexto = SecurityContextHolder.createEmptyContext();
        contexto.setAuthentication(new UsernamePasswordAuthenticationToken(
                new CellierUserPrincipal(idAna, "ana.rivas@gmail.com"), null, List.of()));
        SecurityContextHolder.setContext(contexto);
    }

    private void limpiar() {
        movements.deleteAll();
        items.deleteAll();
        products.deleteAll();
        joinRequests.deleteAll();
        members.deleteAll();
        households.deleteAll();
        refreshTokens.deleteAll();
        users.deleteAll();
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

    private UUID crearHogar(String token, String nombre) throws Exception {
        String body = mockMvc.perform(post("/api/v1/households")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("name", nombre))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("id").asText());
    }

    private JsonNode json(ResultActions actions) throws Exception {
        return objectMapper.readTree(actions.andReturn().getResponse().getContentAsString());
    }

    private UUID idDe(ResultActions actions) throws Exception {
        return UUID.fromString(json(actions.andExpect(status().isCreated())).get("id").asText());
    }
}
