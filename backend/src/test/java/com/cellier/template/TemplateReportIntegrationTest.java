package com.cellier.template;

import com.cellier.PostgresTestcontainerConfig;
import com.cellier.catalog.ProductRepository;
import com.cellier.household.HouseholdMemberRepository;
import com.cellier.household.HouseholdRepository;
import com.cellier.household.JoinRequestRepository;
import com.cellier.identity.GoogleIdentity;
import com.cellier.identity.GoogleTokenVerifier;
import com.cellier.identity.RefreshTokenRepository;
import com.cellier.identity.UserRepository;
import com.cellier.pantry.PantryItemRepository;
import com.cellier.pantry.StockMovementRepository;
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
 * El reporte de compras: la plantilla menos la despensa.
 *
 * <p>Es la pieza central del módulo y la que tiene criterios propios: una sola consulta, un
 * orden que no baila, y un faltante que nunca baja de cero.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainerConfig.class)
@DisplayName("Reporte de compras")
class TemplateReportIntegrationTest {

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
    private PantryTemplateRepository templates;

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

    @Nested
    @DisplayName("La resta")
    class Resta {

        @Test
        @DisplayName("stock parcial: falta la diferencia")
        void stockParcial() throws Exception {
            UUID huevos = producto("Huevos", "UNIT", "Frescos");
            enDespensa("Huevos", "UNIT", "4");
            UUID plantilla = plantilla("Compra semanal", linea(huevos, "10"));

            reporte(plantilla)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[0].desiredQuantity").value(10.000))
                    .andExpect(jsonPath("$.items[0].availableQuantity").value(4.000))
                    .andExpect(jsonPath("$.items[0].missingQuantity").value(6.000))
                    .andExpect(jsonPath("$.items[0].status").value("MISSING"));
        }

        @Test
        @DisplayName("stock justo: no falta nada")
        void stockCompleto() throws Exception {
            UUID huevos = producto("Huevos", "UNIT", "Frescos");
            enDespensa("Huevos", "UNIT", "10");
            UUID plantilla = plantilla("Compra semanal", linea(huevos, "10"));

            reporte(plantilla)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[0].missingQuantity").value(0.000))
                    .andExpect(jsonPath("$.items[0].status").value("COMPLETE"))
                    .andExpect(jsonPath("$.summary.missingItems").value(0))
                    .andExpect(jsonPath("$.summary.completionRate").value(1.00));
        }

        @Test
        @DisplayName("producto que no está en la despensa: cuenta como cero, y NO desaparece")
        void ausenteDeLaDespensa() throws Exception {
            UUID salsa = producto("Salsa de tomate", "ML", "Despensa");
            UUID plantilla = plantilla("Compra semanal", linea(salsa, "1000"));

            // Con un join normal en vez de un left join, lo que falta del todo sería justo lo
            // que no aparece en la lista de lo que falta.
            reporte(plantilla)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items.length()").value(1))
                    .andExpect(jsonPath("$.items[0].availableQuantity").value(0.000))
                    .andExpect(jsonPath("$.items[0].missingQuantity").value(1000.000))
                    .andExpect(jsonPath("$.items[0].status").value("MISSING"));
        }

        @Test
        @DisplayName("stock por encima de lo deseado: falta cero, nunca negativo")
        void stockDeSobra() throws Exception {
            UUID arroz = producto("Arroz grano largo", "G", "Despensa");
            enDespensa("Arroz grano largo", "G", "2500");
            UUID plantilla = plantilla("Compra semanal", linea(arroz, "1000"));

            // Tener de más no es tener que devolver. Un −1500 en una lista de la compra no le
            // dice a nadie qué hacer.
            reporte(plantilla)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[0].availableQuantity").value(2500.000))
                    .andExpect(jsonPath("$.items[0].missingQuantity").value(0.000))
                    .andExpect(jsonPath("$.items[0].status").value("COMPLETE"));
        }
    }

    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("El resumen")
    class Resumen {

        @Test
        @DisplayName("completionRate con decimales")
        void tasaConDecimales() throws Exception {
            UUID huevos = producto("Huevos", "UNIT", "Frescos");
            UUID salsa = producto("Salsa de tomate", "ML", "Despensa");
            UUID arroz = producto("Arroz grano largo", "G", "Despensa");
            enDespensa("Huevos", "UNIT", "10");
            enDespensa("Salsa de tomate", "ML", "0");

            UUID plantilla = plantilla("Compra semanal",
                    linea(huevos, "10"), linea(salsa, "1000"), linea(arroz, "1000"));

            // Una de tres cubierta: 0,3333… redondeado a dos decimales.
            reporte(plantilla)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.summary.totalItems").value(3))
                    .andExpect(jsonPath("$.summary.missingItems").value(2))
                    .andExpect(jsonPath("$.summary.completionRate").value(0.33));
        }

        @Test
        @DisplayName("dos de tres son 0,67, no 0,66")
        void redondeoHaciaArriba() throws Exception {
            UUID huevos = producto("Huevos", "UNIT", "Frescos");
            UUID salsa = producto("Salsa de tomate", "ML", "Despensa");
            UUID arroz = producto("Arroz grano largo", "G", "Despensa");
            enDespensa("Huevos", "UNIT", "10");
            enDespensa("Salsa de tomate", "ML", "1000");

            UUID plantilla = plantilla("Compra semanal",
                    linea(huevos, "10"), linea(salsa, "1000"), linea(arroz, "1000"));

            reporte(plantilla)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.summary.completionRate").value(0.67));
        }

        @Test
        @DisplayName("una plantilla vacía da todo a cero y no revienta")
        void plantillaVacia() throws Exception {
            UUID plantilla = plantilla("Asado del domingo");

            // Decir «100% cubierto» de una lista sin líneas es afirmar algo de un conjunto
            // vacío: quien lo lea entenderá que ya tiene todo lo que quería tener.
            reporte(plantilla)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.summary.totalItems").value(0))
                    .andExpect(jsonPath("$.summary.missingItems").value(0))
                    .andExpect(jsonPath("$.summary.completionRate").value(0.00))
                    .andExpect(jsonPath("$.items.length()").value(0))
                    .andExpect(jsonPath("$.templateName").value("Asado del domingo"))
                    .andExpect(jsonPath("$.generatedAt").exists());
        }
    }

    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("El orden del supermercado")
    class Orden {

        @Test
        @DisplayName("primero lo que falta, agrupado por categoría, y luego lo cubierto")
        void ordenCompleto() throws Exception {
            UUID pan = producto("Pan de molde", "UNIT", "Panadería");
            UUID huevos = producto("Huevos", "UNIT", "Frescos");
            UUID leche = producto("Leche entera", "L", "Frescos");
            UUID arroz = producto("Arroz grano largo", "G", "Despensa");
            UUID salsa = producto("Salsa de tomate", "ML", "Despensa");

            enDespensa("Arroz grano largo", "G", "5000");   // cubierto
            enDespensa("Salsa de tomate", "ML", "5000");    // cubierto
            enDespensa("Leche entera", "L", "0");           // falta

            UUID plantilla = plantilla("Compra semanal",
                    linea(arroz, "1000"), linea(pan, "2"), linea(salsa, "1000"),
                    linea(huevos, "10"), linea(leche, "2"));

            reporte(plantilla)
                    .andExpect(status().isOk())
                    // Faltantes: Frescos (Huevos, Leche) antes que Panadería (Pan).
                    .andExpect(jsonPath("$.items[0].productName").value("Huevos"))
                    .andExpect(jsonPath("$.items[1].productName").value("Leche entera"))
                    .andExpect(jsonPath("$.items[2].productName").value("Pan de molde"))
                    // Cubiertos al final, también por categoría y nombre.
                    .andExpect(jsonPath("$.items[3].productName").value("Arroz grano largo"))
                    .andExpect(jsonPath("$.items[4].productName").value("Salsa de tomate"))
                    .andExpect(jsonPath("$.items[3].status").value("COMPLETE"));
        }

        @Test
        @DisplayName("un producto sin categoría va al final de su grupo, no al principio")
        void sinCategoria() throws Exception {
            UUID sal = producto("Sal", "G", null);
            UUID huevos = producto("Huevos", "UNIT", "Frescos");
            UUID plantilla = plantilla("Compra semanal", linea(sal, "500"), linea(huevos, "10"));

            reporte(plantilla)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[0].productName").value("Huevos"))
                    .andExpect(jsonPath("$.items[1].productName").value("Sal"));
        }

        @Test
        @DisplayName("dos lecturas seguidas devuelven el mismo orden")
        void ordenEstable() throws Exception {
            UUID uno = producto("Tomates cherry", "UNIT", "Frescos");
            UUID dos = producto("Lechuga", "UNIT", "Frescos");
            UUID tres = producto("Palta", "UNIT", "Frescos");
            UUID plantilla = plantilla("Compra semanal",
                    linea(uno, "1"), linea(dos, "1"), linea(tres, "1"));

            // Misma categoría en los tres: sin el desempate por nombre, el orden lo decidiría
            // el plan de ejecución y la lista se reordenaría sola al recargar.
            List<String> primera = nombresDelReporte(plantilla);
            List<String> segunda = nombresDelReporte(plantilla);

            assertThat(primera).containsExactly("Lechuga", "Palta", "Tomates cherry");
            assertThat(segunda).isEqualTo(primera);
        }
    }

    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Rendimiento")
    class Rendimiento {

        /**
         * El reporte cuesta lo mismo con una línea que con quince.
         *
         * <p>Se compara el coste consigo mismo en vez de fijar un número absoluto: lo que hay
         * que impedir es que crezca con los ítems, y un número clavado a mano se rompería el
         * día que el guardia de membresía cambie una consulta interna, sin que nada esté mal.
         *
         * <p>Lo que se cuenta son sentencias, no milisegundos. Comprobado escribiendo la
         * versión ingenua —recorrer los ítems preguntando a la despensa uno por uno—: este
         * test pasa de 5 sentencias a 19 y se cae.
         *
         * <p>Y resulta que se caen tres, no uno: los dos tests de orden también, porque el
         * orden lo pone la consulta. La consulta única no es sólo más barata; es de donde
         * sale el orden del supermercado. Recorrer en memoria obligaría a reordenar después
         * lo que ya venía ordenado.
         */
        @Test
        @DisplayName("el reporte no cuesta más por tener más líneas")
        void noCreceConLosItems() throws Exception {
            UUID pequena = conLineas("Compra corta", 1);
            UUID grande = conLineas("Compra grande", 15);

            long costePequena = sentenciasDelReporte(pequena, 1);
            long costeGrande = sentenciasDelReporte(grande, 15);

            assertThat(costeGrande)
                    .describedAs("quince líneas cuestan lo mismo que una: el cruce es uno solo")
                    .isEqualTo(costePequena);

            // Y además es un puñado fijo, no algo que dependa del tamaño de la despensa.
            assertThat(costeGrande).isLessThanOrEqualTo(5);
        }

        /** Crea una plantilla con n líneas, con un tercio de ellas cubiertas por la despensa. */
        private UUID conLineas(String nombre, int cuantas) throws Exception {
            @SuppressWarnings("unchecked")
            Map<String, Object>[] lineas = new Map[cuantas];
            for (int i = 0; i < cuantas; i++) {
                String producto = nombre + " producto " + i;
                UUID id = producto(producto, "UNIT", i % 2 == 0 ? "Frescos" : "Despensa");
                if (i % 3 == 0) {
                    enDespensa(producto, "UNIT", "2");
                }
                lineas[i] = linea(id, "5");
            }
            return plantilla(nombre, lineas);
        }

        private long sentenciasDelReporte(UUID plantilla, int lineasEsperadas) throws Exception {
            Statistics estadisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
            estadisticas.clear();

            reporte(plantilla)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items.length()").value(lineasEsperadas));

            return estadisticas.getPrepareStatementCount();
        }
    }

    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("El denominador")
    class Denominador {

        /**
         * Fija como DESEADA una divergencia que parece un error.
         *
         * <p>El nivel objetivo de la despensa y la cantidad deseada de una plantilla responden
         * preguntas distintas, y ninguna se deriva de la otra: un hogar puede tener varias
         * plantillas queriendo cantidades distintas del mismo producto, así que no hay
         * derivación que sobreviva. Ver P2 en docs/reglas-plantillas.md.
         *
         * <p>Este test existe para que nadie lo «arregle» más adelante haciendo que el reporte
         * lea `par_level`.
         */
        @Test
        @DisplayName("el reporte usa lo deseado por la plantilla, nunca el nivel objetivo")
        void noLeeParLevel() throws Exception {
            UUID huevos = producto("Huevos", "UNIT", "Frescos");
            UUID articulo = enDespensa("Huevos", "UNIT", "8");
            mockMvc.perform(patch("/api/v1/households/" + casaRivas + "/pantry/items/" + articulo)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"parLevel":12}"""))
                    .andExpect(status().isOk());

            UUID plantilla = plantilla("Compra semanal", linea(huevos, "10"));

            reporte(plantilla)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[0].desiredQuantity").value(10.000))
                    .andExpect(jsonPath("$.items[0].missingQuantity").value(2.000))
                    // Y el reporte no emite nunca ese nombre: ningún cliente puede confundirlos.
                    .andExpect(jsonPath("$.items[0].parLevel").doesNotExist());

            // La despensa sigue midiendo contra el suyo. Las dos cosas son ciertas a la vez.
            mockMvc.perform(get("/api/v1/households/" + casaRivas + "/pantry/items")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].parLevel").value(12.000))
                    .andExpect(jsonPath("$[0].quantity").value(8.000));
        }

        @Test
        @DisplayName("lo que hay sí es el mismo número en las dos pantallas")
        void mismoNumerador() throws Exception {
            UUID huevos = producto("Huevos", "UNIT", "Frescos");
            enDespensa("Huevos", "UNIT", "8");
            UUID plantilla = plantilla("Compra semanal", linea(huevos, "10"));

            JsonNode reporte = json(reporte(plantilla).andExpect(status().isOk()));
            JsonNode despensa = json(mockMvc.perform(get("/api/v1/households/" + casaRivas + "/pantry/items")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk()));

            // Miden contra listones distintos, pero nunca discrepan sobre lo que hay.
            assertThat(reporte.get("items").get(0).get("availableQuantity").asDouble())
                    .isEqualTo(despensa.get(0).get("quantity").asDouble());
        }
    }

    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Aislamiento entre hogares")
    class Aislamiento {

        @Test
        @DisplayName("el reporte de una plantilla ajena responde 404")
        void plantillaAjena() throws Exception {
            UUID huevos = producto("Huevos", "UNIT", "Frescos");
            UUID plantilla = plantilla("Compra semanal", linea(huevos, "10"));

            mockMvc.perform(get(ruta(casaRivas) + "/" + plantilla + "/report")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isNotFound());
            mockMvc.perform(get(ruta(hogarDeBruno) + "/" + plantilla + "/report")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.detail").value("No existe esa plantilla en este hogar."));
        }

        @Test
        @DisplayName("la despensa del otro hogar no cuenta como stock")
        void stockDelOtroHogarNoCuenta() throws Exception {
            // Bruno tiene huevos de sobra; Ana no. Son productos distintos en catálogos
            // distintos, y el cruce va por hogar además de por producto.
            crearProducto(bruno, hogarDeBruno, "Huevos", "UNIT", "Frescos");
            anadirADespensa(bruno, hogarDeBruno, "Huevos", "UNIT", "60");

            UUID huevosDeAna = producto("Huevos", "UNIT", "Frescos");
            UUID plantilla = plantilla("Compra semanal", linea(huevosDeAna, "10"));

            reporte(plantilla)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[0].availableQuantity").value(0.000))
                    .andExpect(jsonPath("$.items[0].missingQuantity").value(10.000));
        }
    }

    // ---------------------------------------------------------------------------------
    // Utilidades
    // ---------------------------------------------------------------------------------

    private String ruta(UUID householdId) {
        return "/api/v1/households/" + householdId + "/templates";
    }

    private ResultActions reporte(UUID templateId) throws Exception {
        return mockMvc.perform(get(ruta(casaRivas) + "/" + templateId + "/report")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana));
    }

    private List<String> nombresDelReporte(UUID templateId) throws Exception {
        JsonNode body = json(reporte(templateId).andExpect(status().isOk()));
        return body.get("items").valueStream().map((i) -> i.get("productName").asString()).toList();
    }

    private Map<String, Object> linea(UUID productId, String desiredQuantity) {
        var linea = new LinkedHashMap<String, Object>();
        linea.put("productId", productId.toString());
        linea.put("desiredQuantity", desiredQuantity);
        return linea;
    }

    @SafeVarargs
    private UUID plantilla(String name, Map<String, Object>... items) throws Exception {
        var cuerpo = new LinkedHashMap<String, Object>();
        cuerpo.put("name", name);
        cuerpo.put("items", List.of(items));
        return idDe(mockMvc.perform(post(ruta(casaRivas))
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cuerpo)))
                .andExpect(status().isCreated()));
    }

    private UUID producto(String name, String unit, String category) throws Exception {
        return crearProducto(ana, casaRivas, name, unit, category);
    }

    private UUID crearProducto(String token, UUID householdId, String name, String unit,
                               String category) throws Exception {
        var cuerpo = new LinkedHashMap<String, Object>();
        cuerpo.put("name", name);
        cuerpo.put("unit", unit);
        if (category != null) {
            cuerpo.put("category", category);
        }
        return idDe(mockMvc.perform(post("/api/v1/households/" + householdId + "/products")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cuerpo)))
                .andExpect(status().isCreated()));
    }

    private UUID enDespensa(String name, String unit, String quantity) throws Exception {
        return anadirADespensa(ana, casaRivas, name, unit, quantity);
    }

    private UUID anadirADespensa(String token, UUID householdId, String name, String unit,
                                 String quantity) throws Exception {
        var cuerpo = new LinkedHashMap<String, Object>();
        cuerpo.put("productName", name);
        cuerpo.put("unit", unit);
        cuerpo.put("quantity", quantity);
        return idDe(mockMvc.perform(post("/api/v1/households/" + householdId + "/pantry/items")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cuerpo)))
                .andExpect(status().isCreated()));
    }

    private void limpiar() {
        templates.deleteAll();
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

    private UUID idDe(ResultActions actions) throws Exception {
        return UUID.fromString(json(actions).get("id").asString());
    }
}
