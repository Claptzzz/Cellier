package com.cellier.pantry;

import com.cellier.PostgresTestcontainerConfig;
import com.cellier.catalog.ProductRepository;
import com.cellier.household.HouseholdMemberRepository;
import com.cellier.household.HouseholdRepository;
import com.cellier.household.JoinRequestRepository;
import com.cellier.identity.GoogleIdentity;
import com.cellier.identity.GoogleTokenVerifier;
import com.cellier.identity.RefreshTokenRepository;
import com.cellier.identity.UserRepository;
import com.cellier.pantry.domain.PantryItem;
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

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Las consultas de la despensa: listado filtrado y ordenado, e historial paginado.
 *
 * <p>Incluye la comprobación directa del invariante del módulo —la cantidad de un artículo es
 * la suma de sus movimientos— sobre una secuencia larga de operaciones mezcladas, en vez de
 * dejarlo derivado de casos sueltos.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainerConfig.class)
@DisplayName("Despensa · consultas")
class PantryQueriesIntegrationTest {

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
    private EntityManagerFactory entityManagerFactory;

    @MockitoBean
    private GoogleTokenVerifier googleTokenVerifier;

    private String ana;
    private String bruno;
    private UUID casaRivas;
    private UUID hogarDeBruno;

    @BeforeEach
    void setUp() throws Exception {
        limpiar();

        stubGoogle("token-ana", "sub-ana", "ana.rivas@gmail.com", "Ana Rivas");
        stubGoogle("token-bruno", "sub-bruno", "bruno.soto@gmail.com", "Bruno Soto");
        ana = login("token-ana");
        bruno = login("token-bruno");

        casaRivas = crearHogar(ana, "Casa Rivas");
        hogarDeBruno = crearHogar(bruno, "Depa Ñuñoa");
    }

    // ---------------------------------------------------------------------------------
    // El invariante del módulo
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("La cantidad es la suma de los movimientos")
    class Invariante {

        /**
         * Una secuencia larga y mezclada sobre varios artículos, y al final la comprobación
         * directa: para cada uno, {@code quantity} contra la suma de los deltas de su
         * historial, leída por la API paginada.
         *
         * <p>Se comprueba aquí y no sólo de refilón en los casos sueltos porque es el
         * invariante del módulo entero: de él salen las tres decisiones que parecerían
         * arbitrarias —consumir registra lo que se gastó y no lo que se pidió, un ajuste sin
         * cambio no escribe fila, y el alta con cantidad registra la entrada—. Si se rompe,
         * la bitácora deja de explicar la cifra.
         */
        @Test
        @DisplayName("tras una secuencia larga de operaciones mezcladas, cada artículo cuadra")
        void laBitacoraExplicaLaCifra() throws Exception {
            UUID huevos = anadir("Huevos", "UNIT", "12");
            UUID salsa = anadir("Salsa de tomate", "ML", "690");
            UUID lechuga = anadir("Lechuga", "UNIT", "0");

            mover(huevos, "consume", "3");
            mover(salsa, "consume", "240");
            mover(lechuga, "restock", "2");
            editar(lechuga, Map.of("quantity", "1"));
            mover(huevos, "restock", "6");
            mover(huevos, "consume", "20");          // más de lo que hay: piso en cero
            mover(salsa, "restock", "500");
            editar(salsa, Map.of("quantity", "500"));
            mover(lechuga, "consume", "1");
            editar(huevos, Map.of("quantity", "12"));
            mover(huevos, "consume", "4");
            editar(salsa, Map.of("quantity", "500"));  // sin cambio: no escribe nada

            for (UUID item : List.of(huevos, salsa, lechuga)) {
                BigDecimal cantidad = items.findById(item).orElseThrow().getQuantity();
                assertThat(sumaDelHistorialViaApi(item))
                        .describedAs("artículo %s", item)
                        .isEqualByComparingTo(cantidad);
            }

            // Y las cifras concretas, para que el invariante no se cumpla por estar todo a cero.
            assertThat(items.findById(huevos).orElseThrow().getQuantity()).isEqualByComparingTo("8.000");
            assertThat(items.findById(salsa).orElseThrow().getQuantity()).isEqualByComparingTo("500.000");
            assertThat(items.findById(lechuga).orElseThrow().getQuantity()).isEqualByComparingTo("0.000");
        }

        /** Suma los deltas recorriendo TODAS las páginas del historial, como haría un cliente. */
        private BigDecimal sumaDelHistorialViaApi(UUID item) throws Exception {
            BigDecimal suma = BigDecimal.ZERO;
            int pagina = 0;
            int totalPaginas;
            do {
                JsonNode respuesta = json(mockMvc.perform(
                                get(ruta(casaRivas) + "/" + item + "/movements?page=" + pagina + "&size=2")
                                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                        .andExpect(status().isOk()));
                for (JsonNode movimiento : respuesta.get("content")) {
                    suma = suma.add(new BigDecimal(movimiento.get("delta").asString()));
                }
                totalPaginas = respuesta.get("totalPages").asInt();
                pagina++;
            } while (pagina < totalPaginas);
            return suma;
        }
    }

    // ---------------------------------------------------------------------------------
    // Listado
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Listado")
    class Listado {

        @Test
        @DisplayName("por defecto ordena por nombre")
        void ordenPorNombre() throws Exception {
            anadir("Salsa de tomate", "ML", "690");
            anadir("Huevos", "UNIT", "12");
            anadir("Lechuga", "UNIT", "2");

            listar("")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(3))
                    .andExpect(jsonPath("$[0].product.name").value("Huevos"))
                    .andExpect(jsonPath("$[1].product.name").value("Lechuga"))
                    .andExpect(jsonPath("$[2].product.name").value("Salsa de tomate"));
        }

        @Test
        @DisplayName("por cantidad, lo que menos queda primero")
        void ordenPorCantidad() throws Exception {
            anadir("Salsa de tomate", "ML", "690");
            anadir("Huevos", "UNIT", "12");
            anadir("Lechuga", "UNIT", "2");

            listar("?sort=QUANTITY")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].product.name").value("Lechuga"))
                    .andExpect(jsonPath("$[1].product.name").value("Huevos"))
                    .andExpect(jsonPath("$[2].product.name").value("Salsa de tomate"));
        }

        @Test
        @DisplayName("por vencimiento, y los que no tienen fecha van al final")
        void ordenPorVencimientoConNulosAlFinal() throws Exception {
            UUID huevos = anadir("Huevos", "UNIT", "12");
            UUID salsa = anadir("Salsa de tomate", "ML", "690");
            anadir("Lechuga", "UNIT", "2");   // sin vencimiento

            editar(huevos, Map.of("expiresAt", "2026-09-25"));
            editar(salsa, Map.of("expiresAt", "2026-10-04"));

            // No tener vencimiento no es vencer muy tarde: es no estar en esa lista.
            listar("?sort=EXPIRY")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].product.name").value("Huevos"))
                    .andExpect(jsonPath("$[1].product.name").value("Salsa de tomate"))
                    .andExpect(jsonPath("$[2].product.name").value("Lechuga"));
        }

        @Test
        @DisplayName("filtra por texto y por categoría, y los combina")
        void filtros() throws Exception {
            anadir("Salsa de tomate", "ML", "690", "Despensa");
            anadir("Tomates cherry", "UNIT", "20", "Nevera");
            anadir("Huevos", "UNIT", "12", "Nevera");

            listar("?search=TOMATE")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(2));

            listar("?category=nevera")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(2));

            listar("?search=tomate&category=Nevera")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].product.name").value("Tomates cherry"));
        }

        @Test
        @DisplayName("un orden que no existe responde 400")
        void ordenDesconocidoDa400() throws Exception {
            listar("?sort=PRECIO").andExpect(status().isBadRequest());
        }
    }

    // ---------------------------------------------------------------------------------
    // Lo que necesita la banda de nivel
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("La banda de nivel")
    class BandaDeNivel {

        @Test
        @DisplayName("el listado trae cantidad y nivel objetivo de cada artículo")
        void traeLoQueNecesitaParaPintarse() throws Exception {
            UUID huevos = anadir("Huevos", "UNIT", "4");
            editar(huevos, Map.of("parLevel", "12"));

            listar("")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].quantity").value(4.000))
                    .andExpect(jsonPath("$[0].parLevel").value(12.000));
        }

        @Test
        @DisplayName("sin objetivo, parLevel viaja como null y NO como cero")
        void sinObjetivoViajaNull() throws Exception {
            anadir("Lechuga", "UNIT", "2");

            JsonNode lista = json(listar("").andExpect(status().isOk()));
            JsonNode item = lista.get(0);

            // El campo tiene que estar presente y valer null. Un cero significaría «el
            // objetivo es cero», y entonces la banda dibujaría una proporción del cero, que
            // es siempre vacío: exactamente lo contrario de «no hay objetivo definido».
            assertThat(item.has("parLevel")).describedAs("el campo debe venir, no omitirse").isTrue();
            assertThat(item.get("parLevel").isNull()).describedAs("y debe ser null, no 0").isTrue();
        }

        @Test
        @DisplayName("el listado entero sale en una sola sentencia, tenga los artículos que tenga")
        void unaSolaSentencia() throws Exception {
            for (int i = 0; i < 8; i++) {
                anadir("Producto " + i, "UNIT", "3");
            }

            Statistics estadisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
            estadisticas.clear();

            listar("")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(8));

            // Una para el guardia de membresía y otra para la despensa con su producto ya
            // cargado. Sin el grafo de entidad serían 2 + 8: cada fila pediría su producto.
            assertThat(estadisticas.getPrepareStatementCount()).isEqualTo(2);
        }
    }

    // ---------------------------------------------------------------------------------
    // Historial
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Historial")
    class Historial {

        @Test
        @DisplayName("lo más reciente primero, con quién lo hizo")
        void ordenYAutor() throws Exception {
            UUID item = anadir("Salsa de tomate", "ML", "690");
            mover(item, "consume", "240");

            historial(item, "")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content.length()").value(2))
                    .andExpect(jsonPath("$.content[0].type").value("CONSUMPTION"))
                    .andExpect(jsonPath("$.content[0].delta").value(-240.000))
                    .andExpect(jsonPath("$.content[0].performedByName").value("Ana Rivas"))
                    .andExpect(jsonPath("$.content[1].type").value("PURCHASE"))
                    .andExpect(jsonPath("$.totalElements").value(2))
                    .andExpect(jsonPath("$.totalPages").value(1));
        }

        @Test
        @DisplayName("pagina, y el tamaño pedido se limita a 100")
        void paginacion() throws Exception {
            UUID item = anadir("Huevos", "UNIT", "0");
            for (int i = 0; i < 7; i++) {
                mover(item, "restock", "1");
            }

            historial(item, "?page=0&size=3")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content.length()").value(3))
                    .andExpect(jsonPath("$.page").value(0))
                    .andExpect(jsonPath("$.size").value(3))
                    .andExpect(jsonPath("$.totalElements").value(7))
                    .andExpect(jsonPath("$.totalPages").value(3));

            historial(item, "?page=2&size=3")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content.length()").value(1));

            historial(item, "?size=5000")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.size").value(100));
        }

        @Test
        @DisplayName("un artículo sin movimientos devuelve una página vacía, no un error")
        void historialVacio() throws Exception {
            UUID item = anadir("Lechuga", "UNIT", "0");

            historial(item, "")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content.length()").value(0))
                    .andExpect(jsonPath("$.totalElements").value(0));
        }
    }

    // ---------------------------------------------------------------------------------
    // Aislamiento
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Aislamiento entre hogares")
    class Aislamiento {

        @Test
        @DisplayName("la despensa y el historial de un hogar ajeno responden 404")
        void hogarAjeno() throws Exception {
            UUID item = anadir("Huevos", "UNIT", "12");

            mockMvc.perform(get(ruta(casaRivas)).header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isNotFound());
            mockMvc.perform(get(ruta(casaRivas) + "/" + item + "/movements")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("el historial de un artículo ajeno no se alcanza desde el hogar propio")
        void historialAjenoDesdeElPropio() throws Exception {
            UUID deAna = anadir("Huevos", "UNIT", "12");

            mockMvc.perform(get(ruta(hogarDeBruno) + "/" + deAna + "/movements")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.detail").value(
                            "No existe ese artículo en la despensa de este hogar."));
        }

        @Test
        @DisplayName("cada hogar ve sólo su despensa")
        void cadaUnoVeLaSuya() throws Exception {
            anadir("Huevos", "UNIT", "12");

            mockMvc.perform(post(ruta(hogarDeBruno))
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"productName":"Lechuga","unit":"UNIT","quantity":1}"""))
                    .andExpect(status().isCreated());

            mockMvc.perform(get(ruta(hogarDeBruno)).header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].product.name").value("Lechuga"));
        }
    }

    // ---------------------------------------------------------------------------------
    // Utilidades
    // ---------------------------------------------------------------------------------

    private String ruta(UUID householdId) {
        return "/api/v1/households/" + householdId + "/pantry/items";
    }

    private ResultActions listar(String query) throws Exception {
        return mockMvc.perform(get(ruta(casaRivas) + query)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana));
    }

    private ResultActions historial(UUID item, String query) throws Exception {
        return mockMvc.perform(get(ruta(casaRivas) + "/" + item + "/movements" + query)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana));
    }

    private UUID anadir(String nombre, String unidad, String cantidad) throws Exception {
        return anadir(nombre, unidad, cantidad, null);
    }

    private UUID anadir(String nombre, String unidad, String cantidad, String categoria) throws Exception {
        if (categoria != null) {
            var producto = new LinkedHashMap<String, Object>();
            producto.put("name", nombre);
            producto.put("unit", unidad);
            producto.put("category", categoria);
            mockMvc.perform(post("/api/v1/households/" + casaRivas + "/products")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(producto)))
                    .andExpect(status().isCreated());
        }

        var cuerpo = new LinkedHashMap<String, Object>();
        cuerpo.put("productName", nombre);
        cuerpo.put("unit", unidad);
        cuerpo.put("quantity", cantidad);
        JsonNode creado = json(mockMvc.perform(post(ruta(casaRivas))
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cuerpo)))
                .andExpect(status().isCreated()));
        return UUID.fromString(creado.get("id").asString());
    }

    private void mover(UUID item, String accion, String cantidad) throws Exception {
        mockMvc.perform(post(ruta(casaRivas) + "/" + item + ":" + accion)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("quantity", cantidad))))
                .andExpect(status().isOk());
    }

    private void editar(UUID item, Map<String, Object> cambios) throws Exception {
        mockMvc.perform(patch(ruta(casaRivas) + "/" + item)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cambios)))
                .andExpect(status().isOk());
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
        return objectMapper.readTree(body).get("accessToken").asString();
    }

    private UUID crearHogar(String token, String nombre) throws Exception {
        String body = mockMvc.perform(post("/api/v1/households")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("name", nombre))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("id").asString());
    }

    private JsonNode json(ResultActions actions) throws Exception {
        return objectMapper.readTree(actions.andReturn().getResponse().getContentAsString());
    }
}
