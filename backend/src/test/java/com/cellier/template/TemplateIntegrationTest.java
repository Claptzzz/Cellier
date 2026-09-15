package com.cellier.template;

import com.cellier.PostgresTestcontainerConfig;
import com.cellier.catalog.ProductRepository;
import com.cellier.household.HouseholdMemberRepository;
import com.cellier.household.HouseholdRepository;
import com.cellier.household.JoinRequestRepository;
import com.cellier.household.domain.HouseholdMember;
import com.cellier.identity.GoogleIdentity;
import com.cellier.identity.GoogleTokenVerifier;
import com.cellier.identity.RefreshTokenRepository;
import com.cellier.identity.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
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
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Plantillas de despensa: crearlas, editarlas, y que no se crucen entre hogares. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainerConfig.class)
@DisplayName("Plantillas")
class TemplateIntegrationTest {

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
    private PantryTemplateRepository templates;

    @Autowired
    private com.cellier.pantry.PantryItemRepository items;

    @Autowired
    private com.cellier.pantry.StockMovementRepository movements;

    @PersistenceContext
    private EntityManager entityManager;

    @MockitoBean
    private GoogleTokenVerifier googleTokenVerifier;

    private String ana;
    private String bruno;
    private UUID casaRivas;
    private UUID hogarDeBruno;
    private UUID huevos;
    private UUID salsa;
    private UUID productoDeBruno;

    @BeforeEach
    void setUp() throws Exception {
        limpiar();

        stubGoogle("token-ana", "sub-ana", "ana.rivas@gmail.com", "Ana Rivas");
        stubGoogle("token-bruno", "sub-bruno", "bruno.soto@gmail.com", "Bruno Soto");
        ana = login("token-ana");
        bruno = login("token-bruno");

        casaRivas = crearHogar(ana, "Casa Rivas");
        hogarDeBruno = crearHogar(bruno, "Depa Ñuñoa");

        huevos = crearProducto(ana, casaRivas, "Huevos", "UNIT", "Frescos");
        salsa = crearProducto(ana, casaRivas, "Salsa de tomate", "ML", "Despensa");
        productoDeBruno = crearProducto(bruno, hogarDeBruno, "Palta", "UNIT", "Frescos");
    }

    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Alta")
    class Alta {

        @Test
        @DisplayName("crea una plantilla con sus productos")
        void conProductos() throws Exception {
            crear(ana, casaRivas, "Compra semanal", linea(huevos, "10"), linea(salsa, "1000"))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.name").value("Compra semanal"))
                    .andExpect(jsonPath("$.createdByName").value("Ana Rivas"))
                    .andExpect(jsonPath("$.items.length()").value(2))
                    .andExpect(jsonPath("$.items[0].productName").value("Huevos"))
                    .andExpect(jsonPath("$.items[0].unit").value("UNIT"))
                    .andExpect(jsonPath("$.items[0].category").value("Frescos"))
                    .andExpect(jsonPath("$.items[0].desiredQuantity").value(10.000));
        }

        @Test
        @DisplayName("una plantilla vacía es un borrador legítimo, no un error")
        void sinProductos() throws Exception {
            crear(ana, casaRivas, "Asado del domingo")
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.items.length()").value(0));
        }

        @Test
        @DisplayName("el nombre es único en el hogar sin distinguir mayúsculas")
        void nombreRepetido() throws Exception {
            crear(ana, casaRivas, "Compra semanal").andExpect(status().isCreated());

            crear(ana, casaRivas, "compra SEMANAL")
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.detail").value(
                            "Ya hay una plantilla llamada «Compra semanal» en este hogar. "
                                    + "Usa otro nombre, o edita la que ya existe."));
        }

        @Test
        @DisplayName("el mismo nombre en otro hogar no molesta")
        void mismoNombreEnOtroHogar() throws Exception {
            crear(ana, casaRivas, "Compra semanal").andExpect(status().isCreated());
            crear(bruno, hogarDeBruno, "Compra semanal").andExpect(status().isCreated());
        }

        @Test
        @DisplayName("querer «cero» de algo no es quererlo: se rechaza")
        void cantidadCero() throws Exception {
            crear(ana, casaRivas, "Compra semanal", linea(huevos, "0"))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("cualquier miembro puede crearlas, no sólo quien administra")
        void noEsAccionDeAdmin() throws Exception {
            hacerMiembro(bruno, casaRivas);

            crear(bruno, casaRivas, "La de Bruno", linea(huevos, "6"))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.createdByName").value("Bruno Soto"));
        }
    }

    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Listado y detalle")
    class Consulta {

        @Test
        @DisplayName("la lista trae el número de productos de cada una")
        void listaConRecuento() throws Exception {
            crear(ana, casaRivas, "Compra semanal", linea(huevos, "10"), linea(salsa, "1000"))
                    .andExpect(status().isCreated());
            crear(ana, casaRivas, "Asado del domingo").andExpect(status().isCreated());

            mockMvc.perform(get(ruta(casaRivas)).header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(2))
                    // Ordenadas por nombre: «Asado» antes que «Compra».
                    .andExpect(jsonPath("$[0].name").value("Asado del domingo"))
                    .andExpect(jsonPath("$[0].itemCount").value(0))
                    .andExpect(jsonPath("$[1].name").value("Compra semanal"))
                    .andExpect(jsonPath("$[1].itemCount").value(2));
        }

        @Test
        @DisplayName("una plantilla sin nada devuelve lista vacía, no un error")
        void sinPlantillas() throws Exception {
            mockMvc.perform(get(ruta(casaRivas)).header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(0));
        }
    }

    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Edición")
    class Edicion {

        @Test
        @DisplayName("renombrar")
        void renombrar() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Compra semanal").andExpect(status().isCreated()));

            mockMvc.perform(patch(ruta(casaRivas) + "/" + id)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"name":"Compra quincenal"}"""))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value("Compra quincenal"));
        }

        @Test
        @DisplayName("renombrarse a sí misma con otras mayúsculas no es un conflicto")
        void renombrarseASiMisma() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Compra semanal").andExpect(status().isCreated()));

            mockMvc.perform(patch(ruta(casaRivas) + "/" + id)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"name":"COMPRA SEMANAL"}"""))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value("COMPRA SEMANAL"));
        }

        @Test
        @DisplayName("borrar se lleva sus líneas, y no toca el catálogo")
        void borrar() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Compra semanal", linea(huevos, "10"))
                    .andExpect(status().isCreated()));

            mockMvc.perform(delete(ruta(casaRivas) + "/" + id)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isNoContent());

            assertThat(templates.findById(id)).isEmpty();
            // El producto sigue en el catálogo: la plantilla decía qué se quiere, no qué existe.
            assertThat(products.findById(huevos)).isPresent();
        }
    }

    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Reemplazo de la lista")
    class Reemplazo {

        @Test
        @DisplayName("lo que no venga deja de estar")
        void reemplazaEntera() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Compra semanal",
                    linea(huevos, "10"), linea(salsa, "1000")).andExpect(status().isCreated()));

            reemplazar(ana, casaRivas, id, linea(salsa, "2000"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items.length()").value(1))
                    .andExpect(jsonPath("$.items[0].productName").value("Salsa de tomate"))
                    .andExpect(jsonPath("$.items[0].desiredQuantity").value(2000.000));
        }

        @Test
        @DisplayName("una lista vacía deja la plantilla sin productos, que no es borrarla")
        void reemplazaPorNada() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Compra semanal", linea(huevos, "10"))
                    .andExpect(status().isCreated()));

            reemplazar(ana, casaRivas, id)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items.length()").value(0));

            assertThat(templates.findById(id)).isPresent();
        }

        /**
         * Lo que pidió el enunciado: la validación es sobre el conjunto, y ocurre antes de
         * escribir. Si se validara producto a producto, las líneas anteriores a la mala ya
         * estarían aplicadas y la plantilla quedaría en un estado que nadie pidió.
         */
        @Test
        @DisplayName("un producto ajeno en la última línea no deja aplicadas las primeras")
        void productoAjenoNoDejaReemplazoAMedias() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Compra semanal", linea(huevos, "10"))
                    .andExpect(status().isCreated()));

            reemplazar(ana, casaRivas, id, linea(salsa, "1000"), linea(productoDeBruno, "3"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString(
                            "no son del catálogo de este hogar")))
                    .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString(
                            productoDeBruno.toString())));

            // Intacta: ni la línea buena de la petición ni la pérdida de la que ya había.
            mockMvc.perform(get(ruta(casaRivas) + "/" + id)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items.length()").value(1))
                    .andExpect(jsonPath("$.items[0].productName").value("Huevos"));
        }

        @Test
        @DisplayName("el mismo producto dos veces se rechaza, diciendo cuál")
        void productoRepetido() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Compra semanal").andExpect(status().isCreated()));

            reemplazar(ana, casaRivas, id, linea(huevos, "10"), linea(huevos, "4"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("Huevos")));
        }
    }

    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Aislamiento entre hogares")
    class Aislamiento {

        @Test
        @DisplayName("las plantillas de un hogar ajeno no se ven ni se tocan")
        void hogarAjeno() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Compra semanal").andExpect(status().isCreated()));

            mockMvc.perform(get(ruta(casaRivas)).header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isNotFound());
            mockMvc.perform(get(ruta(casaRivas) + "/" + id)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isNotFound());
            mockMvc.perform(delete(ruta(casaRivas) + "/" + id)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isNotFound());
            reemplazar(bruno, casaRivas, id, linea(huevos, "1"))
                    .andExpect(status().isNotFound());
            mockMvc.perform(patch(ruta(casaRivas) + "/" + id)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"name":"Mía"}"""))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("una plantilla ajena no se alcanza desde el hogar propio")
        void plantillaAjenaDesdeElPropio() throws Exception {
            UUID deAna = idDe(crear(ana, casaRivas, "Compra semanal").andExpect(status().isCreated()));

            mockMvc.perform(get(ruta(hogarDeBruno) + "/" + deAna)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.detail").value("No existe esa plantilla en este hogar."));
        }

        /**
         * La comprobación que de verdad importa: sin pasar por el servicio.
         *
         * <p>Que un endpoint valide está bien, pero el servicio se puede saltar —una
         * migración, un script, un endpoint futuro escrito con prisa—. Lo que hace que la
         * fila cruzada sea imposible es la clave foránea al par, y eso sólo se comprueba
         * escribiendo SQL directo contra la base.
         */
        @Test
        @Transactional
        @DisplayName("la base rechaza una línea con plantilla de un hogar y producto de otro")
        void filaCruzadaEsImposibleEnSQL() throws Exception {
            UUID plantillaDeAna = idDe(crear(ana, casaRivas, "Compra semanal")
                    .andExpect(status().isCreated()));

            assertThatThrownBy(() -> {
                entityManager.createNativeQuery("""
                                insert into template_items
                                    (id, household_id, template_id, product_id, desired_quantity)
                                values (gen_random_uuid(), :hogar, :plantilla, :producto, 5)
                                """)
                        .setParameter("hogar", casaRivas)
                        .setParameter("plantilla", plantillaDeAna)
                        .setParameter("producto", productoDeBruno)
                        .executeUpdate();
                entityManager.flush();
            }).hasMessageContaining("fk_template_items_product");
        }

        @Test
        @Transactional
        @DisplayName("y tampoco vale mentir en household_id para que encaje el producto")
        void mentirEnElHogarTampocoCuela() throws Exception {
            UUID plantillaDeAna = idDe(crear(ana, casaRivas, "Compra semanal")
                    .andExpect(status().isCreated()));

            // Poner el hogar de Bruno hace que encaje el producto, y entonces deja de encajar
            // la plantilla. Las dos claves foráneas se sostienen la una a la otra.
            assertThatThrownBy(() -> {
                entityManager.createNativeQuery("""
                                insert into template_items
                                    (id, household_id, template_id, product_id, desired_quantity)
                                values (gen_random_uuid(), :hogar, :plantilla, :producto, 5)
                                """)
                        .setParameter("hogar", hogarDeBruno)
                        .setParameter("plantilla", plantillaDeAna)
                        .setParameter("producto", productoDeBruno)
                        .executeUpdate();
                entityManager.flush();
            }).hasMessageContaining("fk_template_items_template");
        }
    }

    // ---------------------------------------------------------------------------------
    // Utilidades
    // ---------------------------------------------------------------------------------

    private String ruta(UUID householdId) {
        return "/api/v1/households/" + householdId + "/templates";
    }

    private Map<String, Object> linea(UUID productId, String desiredQuantity) {
        var linea = new LinkedHashMap<String, Object>();
        linea.put("productId", productId.toString());
        linea.put("desiredQuantity", desiredQuantity);
        return linea;
    }

    @SafeVarargs
    private ResultActions crear(String token, UUID householdId, String name,
                                Map<String, Object>... items) throws Exception {
        var cuerpo = new LinkedHashMap<String, Object>();
        cuerpo.put("name", name);
        cuerpo.put("items", List.of(items));
        return mockMvc.perform(post(ruta(householdId))
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(cuerpo)));
    }

    @SafeVarargs
    private ResultActions reemplazar(String token, UUID householdId, UUID templateId,
                                     Map<String, Object>... items) throws Exception {
        return mockMvc.perform(put(ruta(householdId) + "/" + templateId + "/items")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("items", List.of(items)))));
    }

    private UUID crearProducto(String token, UUID householdId, String name, String unit,
                               String category) throws Exception {
        var cuerpo = new LinkedHashMap<String, Object>();
        cuerpo.put("name", name);
        cuerpo.put("unit", unit);
        cuerpo.put("category", category);
        return idDe(mockMvc.perform(post("/api/v1/households/" + householdId + "/products")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cuerpo)))
                .andExpect(status().isCreated()));
    }

    /** Mete a alguien en el hogar sin pasar por el ciclo de solicitud, que aquí no es el tema. */
    private void hacerMiembro(String token, UUID householdId) {
        String email = token.equals(bruno) ? "bruno.soto@gmail.com" : "ana.rivas@gmail.com";
        members.save(HouseholdMember.member(
                households.findById(householdId).orElseThrow(),
                users.findAll().stream()
                        .filter((u) -> u.getEmail().equalsIgnoreCase(email))
                        .findFirst().orElseThrow()));
    }

    private void limpiar() {
        templates.deleteAll();
        // La despensa referencia el catálogo con ON DELETE RESTRICT, así que borrar productos
        // sin vaciarla antes falla. Aquí no hay despensa, pero otros tests del mismo módulo
        // la dejan puesta: la limpieza tiene que valer también cuando no se corre sola.
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

    private UUID idDe(ResultActions actions) throws Exception {
        JsonNode body = objectMapper.readTree(actions.andReturn().getResponse().getContentAsString());
        return UUID.fromString(body.get("id").asString());
    }
}
