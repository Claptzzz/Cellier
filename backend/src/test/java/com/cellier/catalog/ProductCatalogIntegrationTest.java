package com.cellier.catalog;

import com.cellier.PostgresTestcontainerConfig;
import com.cellier.household.HouseholdMemberRepository;
import com.cellier.household.HouseholdRepository;
import com.cellier.household.JoinRequestRepository;
import com.cellier.identity.GoogleIdentity;
import com.cellier.identity.GoogleTokenVerifier;
import com.cellier.identity.RefreshTokenRepository;
import com.cellier.identity.UserRepository;
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
 * El catálogo de productos contra un PostgreSQL real.
 *
 * <p>Ana administra «Casa Rivas»; Bruno tiene su propio hogar y no pertenece al de Ana. Con
 * esos dos papeles se cubre lo que el módulo debe garantizar: que el catálogo es de cada
 * hogar y que un producto ajeno no existe a ojos de quien no está dentro.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainerConfig.class)
@DisplayName("Catálogo de productos")
class ProductCatalogIntegrationTest {

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
    // Alta y unicidad
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Alta")
    class Alta {

        @Test
        @DisplayName("crear un producto devuelve 201 con su unidad y su categoría")
        void crearProducto() throws Exception {
            crear(ana, casaRivas, "Salsa de tomate", "ML", "Despensa")
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.name").value("Salsa de tomate"))
                    .andExpect(jsonPath("$.unit").value("ML"))
                    .andExpect(jsonPath("$.category").value("Despensa"))
                    .andExpect(jsonPath("$.id").isNotEmpty());
        }

        @Test
        @DisplayName("el mismo nombre en otra capitalización responde 409 y no duplica")
        void nombreDuplicadoIgnorandoMayusculas() throws Exception {
            crear(ana, casaRivas, "Salsa de tomate", "ML", null).andExpect(status().isCreated());

            crear(ana, casaRivas, "SALSA DE TOMATE", "ML", null)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.detail").value(
                            "Ya existe «Salsa de tomate» en este hogar, medido en ML. "
                                    + "Usa ese producto, o elige otro nombre para «SALSA DE TOMATE»."));

            assertThat(products.count()).isEqualTo(1);
        }

        @Test
        @DisplayName("el mensaje del 409 dice la unidad del que ya existe, que es lo que hay que decidir")
        void elConflictoDiceLaUnidad() throws Exception {
            crear(ana, casaRivas, "Leche", "L", null).andExpect(status().isCreated());

            // Sin conversión de unidades, reutilizar en silencio guardaría litros como gramos.
            crear(ana, casaRivas, "leche", "G", null)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("medido en L")));
        }

        @Test
        @DisplayName("dos hogares pueden tener el mismo producto sin estorbarse")
        void elCatalogoEsDeCadaHogar() throws Exception {
            crear(ana, casaRivas, "Huevos", "UNIT", null).andExpect(status().isCreated());
            crear(bruno, hogarDeBruno, "Huevos", "PACK", null).andExpect(status().isCreated());

            assertThat(products.count()).isEqualTo(2);
        }

        @Test
        @DisplayName("el nombre se recorta y una unidad desconocida responde 400")
        void validaciones() throws Exception {
            crear(ana, casaRivas, "   Lechuga   ", "UNIT", null)
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.name").value("Lechuga"));

            crear(ana, casaRivas, "Pan", "DOCENA", null).andExpect(status().isBadRequest());
            crear(ana, casaRivas, "   ", "UNIT", null)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors.name").isNotEmpty());
        }
    }

    // ---------------------------------------------------------------------------------
    // Listado
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Listado")
    class Listado {

        @Test
        @DisplayName("ordena por nombre y busca sin distinguir mayúsculas")
        void buscar() throws Exception {
            crear(ana, casaRivas, "Salsa de tomate", "ML", null);
            crear(ana, casaRivas, "Huevos", "UNIT", null);
            crear(ana, casaRivas, "Lechuga", "UNIT", null);

            mockMvc.perform(get(ruta(casaRivas)).header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(3))
                    .andExpect(jsonPath("$[0].name").value("Huevos"))
                    .andExpect(jsonPath("$[1].name").value("Lechuga"))
                    .andExpect(jsonPath("$[2].name").value("Salsa de tomate"));

            mockMvc.perform(get(ruta(casaRivas) + "?search=TOMATE")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].name").value("Salsa de tomate"));
        }

        @Test
        @DisplayName("cada hogar ve sólo su catálogo")
        void aislamientoDelCatalogo() throws Exception {
            crear(ana, casaRivas, "Huevos", "UNIT", null);
            crear(bruno, hogarDeBruno, "Lechuga", "UNIT", null);

            // El status va primero: sin él, un 500 hacía que `$.length()` contara las
            // propiedades del ProblemDetail y el fallo se leía como «esperaba 1, hubo 5».
            mockMvc.perform(get(ruta(casaRivas)).header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].name").value("Huevos"));
        }
    }

    // ---------------------------------------------------------------------------------
    // Edición
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Edición")
    class Edicion {

        @Test
        @DisplayName("renombra y recategoriza; una categoría vacía la quita")
        void renombraYRecategoriza() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Huevos", "UNIT", "Nevera"));

            editar(ana, casaRivas, id, Map.of("name", "Huevos de campo"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value("Huevos de campo"))
                    .andExpect(jsonPath("$.category").value("Nevera"));

            editar(ana, casaRivas, id, Map.of("category", ""))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.category").doesNotExist());
        }

        @Test
        @DisplayName("la unidad no se puede cambiar: el campo no existe y se ignora")
        void laUnidadNoSeCambia() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Leche", "L", null));

            editar(ana, casaRivas, id, Map.of("unit", "G"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.unit").value("L"));

            assertThat(products.findById(id).orElseThrow().getUnit().name()).isEqualTo("L");
        }

        @Test
        @DisplayName("renombrar a un nombre ya ocupado responde 409")
        void renombrarAUnoOcupado() throws Exception {
            crear(ana, casaRivas, "Huevos", "UNIT", null);
            UUID lechuga = idDe(crear(ana, casaRivas, "Lechuga", "UNIT", null));

            editar(ana, casaRivas, lechuga, Map.of("name", "huevos"))
                    .andExpect(status().isConflict());

            assertThat(products.findById(lechuga).orElseThrow().getName()).isEqualTo("Lechuga");
        }

        @Test
        @DisplayName("renombrarse a sí mismo con otra capitalización sí se permite")
        void cambiarLaPropiaCapitalizacion() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "huevos", "UNIT", null));

            editar(ana, casaRivas, id, Map.of("name", "Huevos"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value("Huevos"));
        }
    }

    // ---------------------------------------------------------------------------------
    // Borrado
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Borrado")
    class Borrado {

        @Test
        @DisplayName("un producto sin usar se borra")
        void borrarSinUso() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Lechuga", "UNIT", null));

            mockMvc.perform(delete(ruta(casaRivas) + "/" + id)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isNoContent());

            assertThat(products.findById(id)).isEmpty();
        }

        @Test
        @DisplayName("un producto en la despensa responde 409 y sigue existiendo")
        void borrarEnUsoDa409() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Huevos", "UNIT", null));
            ponerEnDespensa(casaRivas, id);

            mockMvc.perform(delete(ruta(casaRivas) + "/" + id)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.detail").value(
                            "No se puede eliminar «Huevos»: está en la despensa. Quítalo de la despensa primero."));

            assertThat(products.findById(id)).isPresent();
        }
    }

    // ---------------------------------------------------------------------------------
    // Aislamiento
    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Aislamiento entre hogares")
    class Aislamiento {

        @Test
        @DisplayName("todos los endpoints del catálogo de un hogar ajeno responden 404")
        void hogarAjeno() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Huevos", "UNIT", null));
            String comoBruno = "Bearer " + bruno;

            mockMvc.perform(get(ruta(casaRivas)).header(HttpHeaders.AUTHORIZATION, comoBruno))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.detail").value("No existe ese hogar, o no eres miembro de él."));

            mockMvc.perform(post(ruta(casaRivas))
                            .header(HttpHeaders.AUTHORIZATION, comoBruno)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"name":"Intruso","unit":"UNIT"}"""))
                    .andExpect(status().isNotFound());

            editar(bruno, casaRivas, id, Map.of("name", "Secuestrado")).andExpect(status().isNotFound());

            mockMvc.perform(delete(ruta(casaRivas) + "/" + id).header(HttpHeaders.AUTHORIZATION, comoBruno))
                    .andExpect(status().isNotFound());

            assertThat(products.findById(id).orElseThrow().getName()).isEqualTo("Huevos");
        }

        @Test
        @DisplayName("un producto de otro hogar no se alcanza desde el hogar propio")
        void productoDeOtroHogarDesdeElPropio() throws Exception {
            UUID deAna = idDe(crear(ana, casaRivas, "Huevos", "UNIT", null));

            // Bruno pide un producto que existe, pero usando la ruta de SU hogar.
            editar(bruno, hogarDeBruno, deAna, Map.of("name", "Mío"))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.detail").value("No existe ese producto en este hogar."));
        }

        @Test
        @DisplayName("sin access token no se toca el catálogo")
        void sinTokenDa401() throws Exception {
            mockMvc.perform(get(ruta(casaRivas))).andExpect(status().isUnauthorized());
        }
    }

    // ---------------------------------------------------------------------------------
    // Utilidades
    // ---------------------------------------------------------------------------------

    private String ruta(UUID householdId) {
        return "/api/v1/households/" + householdId + "/products";
    }

    private ResultActions crear(String token, UUID householdId, String name, String unit, String category)
            throws Exception {
        var cuerpo = new java.util.LinkedHashMap<String, Object>();
        cuerpo.put("name", name);
        cuerpo.put("unit", unit);
        if (category != null) {
            cuerpo.put("category", category);
        }
        return mockMvc.perform(post(ruta(householdId))
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(cuerpo)));
    }

    private ResultActions editar(String token, UUID householdId, UUID productId, Map<String, Object> cambios)
            throws Exception {
        return mockMvc.perform(patch(ruta(householdId) + "/" + productId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(cambios)));
    }

    /**
     * Mete el producto en la despensa con SQL directo: la despensa aún no tiene entidad ni
     * endpoints, llegan en el cambio siguiente. Sirve para comprobar que el borrado la ve.
     */
    private void ponerEnDespensa(UUID householdId, UUID productId) {
        var em = entityManagerFactory.createEntityManager();
        var tx = em.getTransaction();
        tx.begin();
        em.createNativeQuery("""
                        insert into pantry_items (household_id, product_id, quantity)
                        values (:household, :product, 12)
                        """)
                .setParameter("household", householdId)
                .setParameter("product", productId)
                .executeUpdate();
        tx.commit();
        em.close();
    }

    private void limpiar() {
        var em = entityManagerFactory.createEntityManager();
        var tx = em.getTransaction();
        tx.begin();
        em.createNativeQuery("delete from stock_movements").executeUpdate();
        em.createNativeQuery("delete from pantry_items").executeUpdate();
        tx.commit();
        em.close();

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
        return UUID.fromString(json(actions).get("id").asText());
    }
}
