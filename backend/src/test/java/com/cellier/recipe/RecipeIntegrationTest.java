package com.cellier.recipe;

import com.cellier.PostgresTestcontainerConfig;
import com.cellier.catalog.ProductRepository;
import com.cellier.household.HouseholdMemberRepository;
import com.cellier.household.HouseholdRepository;
import com.cellier.household.domain.HouseholdMember;
import com.cellier.identity.GoogleIdentity;
import com.cellier.identity.GoogleTokenVerifier;
import com.cellier.identity.UserRepository;
import com.cellier.support.IntegrationTestDatabaseCleaner;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.PersistenceContext;
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
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Recetas: crearlas con ingredientes y pasos, calcular si se pueden cocinar, y aislarlas por hogar. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainerConfig.class)
@DisplayName("Recetas")
class RecipeIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository users;

    @Autowired
    private HouseholdRepository households;

    @Autowired
    private HouseholdMemberRepository members;

    @Autowired
    private ProductRepository products;

    @Autowired
    private RecipeRepository recipes;

    @PersistenceContext
    private EntityManager entityManager;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @MockitoBean
    private GoogleTokenVerifier googleTokenVerifier;

    private String ana;
    private String bruno;
    private UUID casaRivas;
    private UUID hogarDeBruno;
    private UUID huevos;
    private UUID canela;
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
        canela = crearProducto(ana, casaRivas, "Canela", "G", "Despensa");
        productoDeBruno = crearProducto(bruno, hogarDeBruno, "Palta", "UNIT", "Frescos");
    }

    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Alta")
    class Alta {

        @Test
        @DisplayName("crea una receta con descripción, raciones, minutos, ingredientes y pasos")
        void conIngredientesYPasos() throws Exception {
            crearCompleta(ana, casaRivas, "Tortilla de patatas", "Con cebolla, al gusto.", 4, 30,
                    List.of(ingrediente(huevos, "6", false)),
                    List.of("Pelar y cortar las patatas.", "Batir los huevos y freír todo junto."))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.name").value("Tortilla de patatas"))
                    .andExpect(jsonPath("$.description").value("Con cebolla, al gusto."))
                    .andExpect(jsonPath("$.servings").value(4))
                    .andExpect(jsonPath("$.prepMinutes").value(30))
                    .andExpect(jsonPath("$.createdByName").value("Ana Rivas"))
                    .andExpect(jsonPath("$.ingredients.length()").value(1))
                    .andExpect(jsonPath("$.ingredients[0].productName").value("Huevos"))
                    .andExpect(jsonPath("$.ingredients[0].unit").value("UNIT"))
                    .andExpect(jsonPath("$.ingredients[0].quantity").value(6.000))
                    .andExpect(jsonPath("$.ingredients[0].optional").value(false))
                    .andExpect(jsonPath("$.steps.length()").value(2))
                    .andExpect(jsonPath("$.steps[0].position").value(1))
                    .andExpect(jsonPath("$.steps[0].instruction").value("Pelar y cortar las patatas."))
                    .andExpect(jsonPath("$.steps[1].position").value(2));
        }

        @Test
        @DisplayName("una receta sin ingredientes ni pasos es un borrador legítimo, no un error")
        void sinIngredientesNiPasos() throws Exception {
            crear(ana, casaRivas, "Idea suelta", List.of(), List.of())
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.description").doesNotExist())
                    .andExpect(jsonPath("$.servings").doesNotExist())
                    .andExpect(jsonPath("$.ingredients.length()").value(0))
                    .andExpect(jsonPath("$.steps.length()").value(0));
        }

        @Test
        @DisplayName("raciones o minutos en cero o negativo se rechazan")
        void racionesNegativas() throws Exception {
            crearCompleta(ana, casaRivas, "Receta", null, 0, null, List.of(), List.of())
                    .andExpect(status().isBadRequest());
            crearCompleta(ana, casaRivas, "Receta", null, null, -10, List.of(), List.of())
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("dos recetas con el mismo nombre no chocan: no hay unicidad de nombre")
        void mismoNombreNoChoca() throws Exception {
            crear(ana, casaRivas, "Tarta de manzana", List.of(), List.of())
                    .andExpect(status().isCreated());
            crear(ana, casaRivas, "Tarta de manzana", List.of(), List.of())
                    .andExpect(status().isCreated());
        }

        @Test
        @DisplayName("un ingrediente por nombre que no existe en el catálogo se crea")
        void ingredientePorNombreSeCrea() throws Exception {
            crear(ana, casaRivas, "Arroz con leche",
                    List.of(ingredientePorNombre("Arroz", "G", "500", false)), List.of())
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.ingredients[0].productName").value("Arroz"))
                    .andExpect(jsonPath("$.ingredients[0].unit").value("G"));

            assertThat(products.findByHouseholdIdAndNameIgnoreCase(casaRivas, "Arroz")).isPresent();
        }

        @Test
        @DisplayName("un ingrediente por nombre que ya existe con otra unidad choca")
        void choqueDeUnidad() throws Exception {
            crear(ana, casaRivas, "Bizcocho de canela",
                    List.of(ingrediente(canela, "5", false)), List.of())
                    .andExpect(status().isCreated());

            crear(ana, casaRivas, "Otra con canela",
                    List.of(ingredientePorNombre("Canela", "KG", "1", false)), List.of())
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.detail").value(containsString(
                            "ya existe en este hogar medido en G")));
        }

        @Test
        @DisplayName("querer «cero» de un ingrediente no es quererlo: se rechaza")
        void cantidadCero() throws Exception {
            crear(ana, casaRivas, "Receta", List.of(ingrediente(huevos, "0", false)), List.of())
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("un producto de otro hogar no se puede usar por id")
        void ingredienteAjeno() throws Exception {
            crear(ana, casaRivas, "Receta",
                    List.of(ingrediente(productoDeBruno, "1", false)), List.of())
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.detail").value(containsString("no es del catálogo de este hogar")))
                    .andExpect(jsonPath("$.detail").value(containsString(productoDeBruno.toString())));
        }

        @Test
        @DisplayName("el mismo producto dos veces se rechaza, diciendo cuál")
        void ingredienteRepetido() throws Exception {
            crear(ana, casaRivas, "Receta",
                    List.of(ingrediente(huevos, "6", false), ingrediente(huevos, "2", true)), List.of())
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.detail").value(containsString("Huevos")));
        }

        @Test
        @DisplayName("cualquier miembro puede crearlas, no sólo quien administra")
        void noEsAccionDeAdmin() throws Exception {
            hacerMiembro(bruno, casaRivas);

            crear(bruno, casaRivas, "La de Bruno", List.of(ingrediente(huevos, "6", false)), List.of())
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.createdByName").value("Bruno Soto"));
        }
    }

    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Listado y filtro")
    class Consulta {

        @Test
        @DisplayName("la lista trae la disponibilidad ya calculada")
        void listaConDisponibilidad() throws Exception {
            enDespensa("Huevos", "UNIT", "12");
            crear(ana, casaRivas, "Tortilla", List.of(ingrediente(huevos, "6", false)), List.of())
                    .andExpect(status().isCreated());
            crear(ana, casaRivas, "Bizcocho", List.of(ingrediente(canela, "5", false)), List.of())
                    .andExpect(status().isCreated());

            mockMvc.perform(get(ruta(casaRivas)).header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(2))
                    // Orden alfabético: «Bizcocho» antes que «Tortilla».
                    .andExpect(jsonPath("$[0].name").value("Bizcocho"))
                    .andExpect(jsonPath("$[0].availability").value("MISSING"))
                    .andExpect(jsonPath("$[0].missingCount").value(1))
                    .andExpect(jsonPath("$[1].name").value("Tortilla"))
                    .andExpect(jsonPath("$[1].availability").value("READY"))
                    .andExpect(jsonPath("$[1].missingCount").value(0));
        }

        @Test
        @DisplayName("availability=READY sólo trae las que se pueden cocinar")
        void filtroReady() throws Exception {
            enDespensa("Huevos", "UNIT", "12");
            crear(ana, casaRivas, "Tortilla", List.of(ingrediente(huevos, "6", false)), List.of())
                    .andExpect(status().isCreated());
            crear(ana, casaRivas, "Bizcocho", List.of(ingrediente(canela, "5", false)), List.of())
                    .andExpect(status().isCreated());

            mockMvc.perform(get(ruta(casaRivas) + "?availability=READY")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].name").value("Tortilla"));
        }

        @Test
        @DisplayName("availability=MISSING sólo trae las que no se pueden cocinar")
        void filtroMissing() throws Exception {
            enDespensa("Huevos", "UNIT", "12");
            crear(ana, casaRivas, "Tortilla", List.of(ingrediente(huevos, "6", false)), List.of())
                    .andExpect(status().isCreated());
            crear(ana, casaRivas, "Bizcocho", List.of(ingrediente(canela, "5", false)), List.of())
                    .andExpect(status().isCreated());

            mockMvc.perform(get(ruta(casaRivas) + "?availability=MISSING")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].name").value("Bizcocho"));
        }

        @Test
        @DisplayName("el detalle simple no cruza contra la despensa")
        void detalleSinDisponibilidad() throws Exception {
            enDespensa("Huevos", "UNIT", "4");
            UUID id = idDe(crear(ana, casaRivas, "Tortilla",
                    List.of(ingrediente(huevos, "6", false), ingrediente(canela, "5", true)), List.of())
                    .andExpect(status().isCreated()));

            mockMvc.perform(get(ruta(casaRivas) + "/" + id).header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.availability").doesNotExist())
                    .andExpect(jsonPath("$.missingCount").doesNotExist())
                    .andExpect(jsonPath("$.ingredients.length()").value(2))
                    .andExpect(jsonPath("$.ingredients[0].availableQuantity").doesNotExist());
        }

        @Test
        @DisplayName("GET /availability cruza cada ingrediente contra la despensa")
        void disponibilidadConDetalle() throws Exception {
            enDespensa("Huevos", "UNIT", "4");
            UUID id = idDe(crear(ana, casaRivas, "Tortilla",
                    List.of(ingrediente(huevos, "6", false), ingrediente(canela, "5", true)), List.of())
                    .andExpect(status().isCreated()));

            // Orden por categoría y nombre: «Despensa» (Canela) antes que «Frescos» (Huevos).
            disponibilidad(casaRivas, id)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.recipeName").value("Tortilla"))
                    .andExpect(jsonPath("$.availability").value("MISSING"))
                    .andExpect(jsonPath("$.missingCount").value(1))
                    .andExpect(jsonPath("$.items[0].productName").value("Canela"))
                    .andExpect(jsonPath("$.items[0].availableQuantity").value(0.000))
                    .andExpect(jsonPath("$.items[0].missingQuantity").value(5.000))
                    .andExpect(jsonPath("$.items[0].sufficient").value(false))
                    .andExpect(jsonPath("$.items[1].productName").value("Huevos"))
                    .andExpect(jsonPath("$.items[1].availableQuantity").value(4.000))
                    .andExpect(jsonPath("$.items[1].missingQuantity").value(2.000))
                    .andExpect(jsonPath("$.items[1].sufficient").value(false));
        }

        @Test
        @DisplayName("search filtra por nombre, sin distinguir mayúsculas")
        void filtroBusqueda() throws Exception {
            crear(ana, casaRivas, "Tortilla de patatas", List.of(), List.of()).andExpect(status().isCreated());
            crear(ana, casaRivas, "Bizcocho de canela", List.of(), List.of()).andExpect(status().isCreated());

            mockMvc.perform(get(ruta(casaRivas) + "?search=TORTILLA")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].name").value("Tortilla de patatas"));
        }

        @Test
        @DisplayName("sin recetas devuelve lista vacía, no un error")
        void sinRecetas() throws Exception {
            mockMvc.perform(get(ruta(casaRivas)).header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(0));
        }
    }

    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Disponibilidad")
    class Disponibilidad {

        @Test
        @DisplayName("sin ingredientes no opcionales, la receta es MISSING, no READY")
        void sinIngredientesNoOpcionalesEsMissing() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Vacía", List.of(), List.of())
                    .andExpect(status().isCreated()));

            disponibilidad(casaRivas, id)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.availability").value("MISSING"))
                    .andExpect(jsonPath("$.missingCount").value(0));
        }

        @Test
        @DisplayName("todo opcional también es MISSING, aunque nada falte")
        void todoOpcionalEsMissing() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Sólo opcionales",
                    List.of(ingrediente(canela, "5", true)), List.of())
                    .andExpect(status().isCreated()));

            disponibilidad(casaRivas, id)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.availability").value("MISSING"))
                    .andExpect(jsonPath("$.missingCount").value(0));
        }

        @Test
        @DisplayName("un opcional sin stock no baja la receta a MISSING")
        void opcionalNoCuentaParaFaltar() throws Exception {
            enDespensa("Huevos", "UNIT", "12");

            UUID id = idDe(crear(ana, casaRivas, "Tortilla con toque",
                    List.of(ingrediente(huevos, "6", false), ingrediente(canela, "5", true)), List.of())
                    .andExpect(status().isCreated()));

            disponibilidad(casaRivas, id)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.availability").value("READY"))
                    .andExpect(jsonPath("$.missingCount").value(0));
        }

        @Test
        @DisplayName("con todo cubierto, la receta es READY")
        void readyConTodoCubierto() throws Exception {
            enDespensa("Huevos", "UNIT", "12");
            enDespensa("Canela", "G", "20");

            UUID id = idDe(crear(ana, casaRivas, "Tortilla dulce",
                    List.of(ingrediente(huevos, "6", false), ingrediente(canela, "5", false)), List.of())
                    .andExpect(status().isCreated()));

            disponibilidad(casaRivas, id)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.availability").value("READY"));
        }

        @Test
        @DisplayName("disponibilidad de una receta ajena responde 404")
        void disponibilidadDeRecetaAjena() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Tortilla", List.of(), List.of())
                    .andExpect(status().isCreated()));

            mockMvc.perform(get(ruta(casaRivas) + "/" + id + "/availability")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isNotFound());
        }
    }

    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Edición")
    class Edicion {

        @Test
        @DisplayName("el PUT reemplaza nombre, ingredientes y pasos a la vez")
        void reemplazaEntera() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Tortilla",
                    List.of(ingrediente(huevos, "6", false)), List.of("Batir.")).andExpect(status().isCreated()));

            actualizar(ana, casaRivas, id, "Tortilla francesa",
                    List.of(ingrediente(canela, "2", true)), List.of("Batir.", "Freír."))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value("Tortilla francesa"))
                    .andExpect(jsonPath("$.ingredients.length()").value(1))
                    .andExpect(jsonPath("$.ingredients[0].productName").value("Canela"))
                    .andExpect(jsonPath("$.steps.length()").value(2))
                    .andExpect(jsonPath("$.steps[1].instruction").value("Freír."));
        }

        @Test
        @DisplayName("los pasos se reindexan por posición, no por lo que tenían antes")
        void pasosSeReindexanAlReemplazar() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Receta",
                    List.of(), List.of("Uno", "Dos", "Tres")).andExpect(status().isCreated()));

            actualizar(ana, casaRivas, id, "Receta", List.of(), List.of("Solo", "Este"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.steps.length()").value(2))
                    .andExpect(jsonPath("$.steps[0].position").value(1))
                    .andExpect(jsonPath("$.steps[0].instruction").value("Solo"))
                    .andExpect(jsonPath("$.steps[1].position").value(2))
                    .andExpect(jsonPath("$.steps[1].instruction").value("Este"));

            actualizar(ana, casaRivas, id, "Receta", List.of(), List.of("A", "B", "C", "D"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.steps.length()").value(4))
                    .andExpect(jsonPath("$.steps[3].position").value(4))
                    .andExpect(jsonPath("$.steps[3].instruction").value("D"));
        }

        @Test
        @DisplayName("borrar se lleva sus ingredientes y pasos, y no toca el catálogo")
        void borrar() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Tortilla",
                    List.of(ingrediente(huevos, "6", false)), List.of("Batir.")).andExpect(status().isCreated()));

            mockMvc.perform(delete(ruta(casaRivas) + "/" + id).header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isNoContent());

            assertThat(recipes.findById(id)).isEmpty();
            assertThat(products.findById(huevos)).isPresent();
        }
    }

    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Aislamiento entre hogares")
    class Aislamiento {

        @Test
        @DisplayName("las recetas de un hogar ajeno no se ven ni se tocan")
        void hogarAjeno() throws Exception {
            UUID id = idDe(crear(ana, casaRivas, "Tortilla", List.of(), List.of())
                    .andExpect(status().isCreated()));

            mockMvc.perform(get(ruta(casaRivas)).header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isNotFound());
            mockMvc.perform(get(ruta(casaRivas) + "/" + id).header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isNotFound());
            mockMvc.perform(delete(ruta(casaRivas) + "/" + id).header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isNotFound());
            actualizar(bruno, casaRivas, id, "Mía", List.of(), List.of())
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("una receta ajena no se alcanza desde el hogar propio")
        void recetaAjenaDesdeElPropio() throws Exception {
            UUID deAna = idDe(crear(ana, casaRivas, "Tortilla", List.of(), List.of())
                    .andExpect(status().isCreated()));

            mockMvc.perform(get(ruta(hogarDeBruno) + "/" + deAna).header(HttpHeaders.AUTHORIZATION, "Bearer " + bruno))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.detail").value("No existe esa receta en este hogar."));
        }

        /**
         * La comprobación que de verdad importa: sin pasar por el servicio, igual que en
         * plantillas. Lo que hace imposible la fila cruzada es la clave foránea al par.
         */
        @Test
        @Transactional
        @DisplayName("la base rechaza una línea con receta de un hogar y producto de otro")
        void filaCruzadaEsImposibleEnSQL() throws Exception {
            UUID recetaDeAna = idDe(crear(ana, casaRivas, "Tortilla", List.of(), List.of())
                    .andExpect(status().isCreated()));

            assertThatThrownBy(() -> {
                entityManager.createNativeQuery("""
                                insert into recipe_ingredients
                                    (id, household_id, recipe_id, product_id, quantity, optional)
                                values (gen_random_uuid(), :hogar, :receta, :producto, 5, false)
                                """)
                        .setParameter("hogar", casaRivas)
                        .setParameter("receta", recetaDeAna)
                        .setParameter("producto", productoDeBruno)
                        .executeUpdate();
                entityManager.flush();
            }).hasMessageContaining("fk_recipe_ingredients_product");
        }

        @Test
        @Transactional
        @DisplayName("y tampoco vale mentir en household_id para que encaje el producto")
        void mentirEnElHogarTampocoCuela() throws Exception {
            UUID recetaDeAna = idDe(crear(ana, casaRivas, "Tortilla", List.of(), List.of())
                    .andExpect(status().isCreated()));

            assertThatThrownBy(() -> {
                entityManager.createNativeQuery("""
                                insert into recipe_ingredients
                                    (id, household_id, recipe_id, product_id, quantity, optional)
                                values (gen_random_uuid(), :hogar, :receta, :producto, 5, false)
                                """)
                        .setParameter("hogar", hogarDeBruno)
                        .setParameter("receta", recetaDeAna)
                        .setParameter("producto", productoDeBruno)
                        .executeUpdate();
                entityManager.flush();
            }).hasMessageContaining("fk_recipe_ingredients_recipe");
        }

        @Test
        @DisplayName("la despensa del otro hogar no cuenta como stock")
        void stockDelOtroHogarNoCuenta() throws Exception {
            crearProducto(bruno, hogarDeBruno, "Huevos", "UNIT", "Frescos");
            anadirADespensa(bruno, hogarDeBruno, "Huevos", "UNIT", "60");

            UUID id = idDe(crear(ana, casaRivas, "Tortilla", List.of(ingrediente(huevos, "6", false)), List.of())
                    .andExpect(status().isCreated()));

            disponibilidad(casaRivas, id)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[0].availableQuantity").value(0.000))
                    .andExpect(jsonPath("$.availability").value("MISSING"));
        }
    }

    // ---------------------------------------------------------------------------------

    @Nested
    @DisplayName("Rendimiento")
    class Rendimiento {

        /**
         * El listado cuesta lo mismo con una receta que con quince.
         *
         * <p>Se compara el coste consigo mismo en vez de fijar un número: lo que hay que
         * impedir es que el filtro de disponibilidad consulte receta por receta. Comprobado
         * que el test distingue algo: sustituir la consulta agregada por un bucle que pide la
         * despensa por cada receta hace crecer el número de sentencias con el tamaño de la
         * lista, y este test se cae.
         */
        @Test
        @DisplayName("el listado no cuesta más por tener más recetas")
        void noCreceConLasRecetas() throws Exception {
            crear(ana, casaRivas, "Primera", List.of(ingrediente(huevos, "1", false)), List.of())
                    .andExpect(status().isCreated());
            long costeDeUna = sentenciasDelListado(1);

            for (int i = 0; i < 14; i++) {
                crear(ana, casaRivas, "Receta " + i, List.of(ingrediente(canela, "1", false)), List.of())
                        .andExpect(status().isCreated());
            }
            long costeDeQuince = sentenciasDelListado(15);

            assertThat(costeDeQuince)
                    .describedAs("quince recetas cuestan lo mismo que una: el cruce es una sola consulta")
                    .isEqualTo(costeDeUna);
        }

        private long sentenciasDelListado(int esperadas) throws Exception {
            Statistics estadisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
            estadisticas.clear();

            mockMvc.perform(get(ruta(casaRivas)).header(HttpHeaders.AUTHORIZATION, "Bearer " + ana))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(esperadas));

            return estadisticas.getPrepareStatementCount();
        }
    }

    // ---------------------------------------------------------------------------------
    // Utilidades
    // ---------------------------------------------------------------------------------

    private String ruta(UUID householdId) {
        return "/api/v1/households/" + householdId + "/recipes";
    }

    private Map<String, Object> ingrediente(UUID productId, String quantity, boolean optional) {
        var m = new LinkedHashMap<String, Object>();
        m.put("productId", productId.toString());
        m.put("quantity", quantity);
        m.put("optional", optional);
        return m;
    }

    private Map<String, Object> ingredientePorNombre(String name, String unit, String quantity, boolean optional) {
        var m = new LinkedHashMap<String, Object>();
        m.put("productName", name);
        m.put("unit", unit);
        m.put("quantity", quantity);
        m.put("optional", optional);
        return m;
    }

    private ResultActions crear(String token, UUID householdId, String name,
                                List<Map<String, Object>> ingredients, List<String> steps) throws Exception {
        return crearCompleta(token, householdId, name, null, null, null, ingredients, steps);
    }

    private ResultActions crearCompleta(String token, UUID householdId, String name, String description,
                                        Integer servings, Integer prepMinutes,
                                        List<Map<String, Object>> ingredients, List<String> steps) throws Exception {
        var cuerpo = new LinkedHashMap<String, Object>();
        cuerpo.put("name", name);
        cuerpo.put("description", description);
        cuerpo.put("servings", servings);
        cuerpo.put("prepMinutes", prepMinutes);
        cuerpo.put("ingredients", ingredients);
        cuerpo.put("steps", steps);
        return mockMvc.perform(post(ruta(householdId))
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(cuerpo)));
    }

    private ResultActions disponibilidad(UUID householdId, UUID recipeId) throws Exception {
        return mockMvc.perform(get(ruta(householdId) + "/" + recipeId + "/availability")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + ana));
    }

    private ResultActions actualizar(String token, UUID householdId, UUID recipeId, String name,
                                     List<Map<String, Object>> ingredients, List<String> steps) throws Exception {
        var cuerpo = new LinkedHashMap<String, Object>();
        cuerpo.put("name", name);
        cuerpo.put("ingredients", ingredients);
        cuerpo.put("steps", steps);
        return mockMvc.perform(put(ruta(householdId) + "/" + recipeId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(cuerpo)));
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
        IntegrationTestDatabaseCleaner.cleanAll(entityManagerFactory);
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
