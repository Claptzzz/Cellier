# Reglas de las recetas

- **Ámbito:** `recipe/`, y la frontera con `catalog/` y `pantry/`
- **Actualizado:** 2026-09-22

Cada una dice qué se cumple, dónde vive y qué test la sujeta. Mismo formato que
[reglas-plantillas.md](reglas-plantillas.md), del que esta receta hereda la mitad de sus
decisiones: una receta es, en parte, una plantilla con ingredientes opcionales.

---

## R1 · READY exige al menos un ingrediente no opcional, y que todos se cumplan

`READY` si y sólo si hay al menos un ingrediente no opcional **y** todos cumplen
`stock >= quantity`. En cualquier otro caso —incluida una receta recién creada, o una en la
que todo se marcó opcional— la receta es `MISSING`.

La lectura literal de «para todo ingrediente no opcional se cumple lo que hace falta» es
verdad vacía cuando no hay ninguno: una receta sin ingredientes obligatorios cumpliría la
condición por no tener nada que comprobar, y saldría `READY` el mismo segundo en que se crea,
antes de escribir una sola línea. Es el mismo hueco que P4 documenta para las plantillas —una
lista vacía no puede proclamar «100% cubierto»— aplicado aquí: una receta sin nada que
comprobar no está lista, está sin empezar.

**Un ingrediente opcional no cuenta ni para bien ni para mal.** «Sal al gusto» sin sal en la
despensa no baja la receta a `MISSING`, pero tampoco la sube a `READY` si es el único
ingrediente: `READY` necesita al menos un ingrediente que sí cuente.

Dónde: `RecipeService.availabilityOf(requiredCount, missingCount)`, usada igual en el listado
y en el detalle de una receta.

Test: `RecipeIntegrationTest.Disponibilidad.sinIngredientesNoOpcionalesEsMissing` crea una
receta vacía y otra con un único ingrediente opcional sin stock, y comprueba que las dos
responden `MISSING`, no `READY`.

---

## R2 · La disponibilidad se calcula en la base, no en el cliente

Igual que el reporte de compras de las plantillas (P1): la disponibilidad de cada receta se
calcula al vuelo con una consulta agregada, nunca se guarda. El filtro
`availability=ALL|READY|MISSING` del listado se resuelve en el `HAVING` de esa misma consulta,
no trayendo todas las recetas para descartarlas en Java.

**El coste no crece con el número de recetas ni de ingredientes.** El listado hace una sola
consulta agrupada por receta; `GET /{id}/availability` hace una sola consulta que cruza los
ingredientes de esa receta contra la despensa, sea cual sea su tamaño.

Test: `RecipeIntegrationTest.Rendimiento.noCreceConLasRecetas` compara el número de sentencias
del listado con una receta y con quince, y exige que sea el mismo. Comprobado que el test
distingue algo: escribir la versión ingenua —pedir la disponibilidad de cada receta para
decidir el filtro— lo habría hecho fallar, igual que en el reporte de compras.

**`search` viaja igual que `filter`: nunca `null`.** El listado también admite filtrar por
nombre. Igual que `availability`, el parámetro nunca llega nulo al repositorio —una cadena
vacía en vez de «sin buscar»—, así que la consulta nunca compara `search` con `null` en JPQL.
No es un matiz cosmético: es la trampa de la sección 6 de
[reglas-esquema.md](reglas-esquema.md) —un parámetro comparado con `null` en JPQL no tiene
tipo y Postgres lo trata como `bytea`— evitada por construcción, sin necesitar dos consultas
separadas como pide esa regla cuando la comparación es contra `null` de verdad.

---

## R3 · `recipe_ingredients` lleva `household_id`; `recipe_steps` no

`recipe_ingredients` referencia **dos** tablas de hogar —`recipes` y `products`— y por eso
lleva su propio `household_id`, con las dos claves foráneas compuestas al par
`(id, household_id)`. Es la regla general de la sección 1 de
[reglas-esquema.md](reglas-esquema.md), aplicada aquí exactamente como en `template_items`.

`recipe_steps` sólo referencia **una** tabla de hogar —`recipes`— y por eso **no** lleva
`household_id` propio. No hay una segunda clave foránea con la que un `household_id`
duplicado pudiera discrepar, así que duplicarlo no cerraría ningún hueco adicional: es el
mismo caso que `stock_movements` con `pantry_items`, documentado en la sección 1 de
reglas-esquema.md bajo «dónde NO aplica».

Test: `RecipeIntegrationTest.Aislamiento.filaCruzadaEsImposibleEnSQL` inserta directo por SQL
una línea de ingrediente cuya receta es de un hogar y cuyo producto es de otro, en las dos
direcciones, y comprueba que las dos claves foráneas se sostienen la una a la otra —igual que
el test equivalente de plantillas.

---

## R4 · El ingrediente por nombre se crea igual que en la despensa

Un ingrediente se indica con `productId` —tiene que ser ya del catálogo de este hogar— o con
`productName` y `unit`. Si el nombre no existe en el catálogo, se crea en la misma
transacción; si ya existe con otra unidad, la petición responde **409** nombrando las dos
unidades, sin reinterpretar la cantidad. Es literalmente la misma lógica que
`PantryService.resolveProduct` (D11 en [reglas-despensa.md](reglas-despensa.md)), reescrita en
`RecipeService` porque no hay un sitio compartido entre despensa y recetas del que colgarla
sin inventar una abstracción para dos usos.

**Sin unicidad de nombre entre ingredientes por lote.** El mismo producto dos veces en la
misma receta se rechaza nombrando cuál se repitió, igual que en las plantillas — pero, al
revés que las plantillas, no hay un pase de validación en bloque antes de escribir: crear un
producto nuevo es parte de resolver cada línea, no algo que se pueda separar de escribir. La
atomicidad la da la transacción completa, no un paso previo: una línea repetida al final
deshace también los productos que se hubieran creado antes.

Test: `RecipeIntegrationTest.Alta.ingredientePorNombreSeCrea`,
`RecipeIntegrationTest.Alta.choqueDeUnidad`, `RecipeIntegrationTest.Alta.ingredienteRepetido`.

---

## R5 · Los pasos se reindexan por posición, no por número enviado

El cliente manda una lista ordenada de texto; el servidor la numera por su posición —el
primero es el paso 1— sin que el cliente pueda elegir ni saltar números. Un `PUT` que cambia
de cinco pasos a tres deja la receta con tres, numerados 1 a 3: no hay huecos que explicar.

**Se reconcilia por posición, no se vacía y se rellena.** Igual que `PantryTemplate.
replaceItems` con los productos (docs/reglas-esquema.md, trampa de INSERT antes que DELETE),
`Recipe.replaceSteps` reutiliza las filas existentes para las posiciones que siguen ocupadas y
sólo borra o crea las que sobran o faltan, para no chocar contra
`uq_recipe_steps_recipe_position` por el orden de descarga de Hibernate dentro de la misma
transacción.

Test: `RecipeIntegrationTest.Edicion.pasosSeReindexanAlReemplazar`.

---

## R6 · Cualquier miembro crea, edita y borra cualquier receta

No es una acción de administrador. `createdBy` es un dato, no una autoridad —igual que en
`created_by` de plantillas—, y queda en nulo si esa persona se da de baja. Sólo se comprueba
membresía en `HouseholdAccessService.requireMember`, nunca rol.

---

## R7 · Sin unicidad de nombre entre recetas

Al revés que las plantillas —donde dos con el mismo nombre confundirían cuál abrir en una
lista de listas de la compra—, dos recetas pueden llamarse igual: son variantes legítimas de
un recetario. No hay índice único de nombre por hogar en `recipes`, a propósito.

---

## R8 · El detalle no es el reporte

`GET /recipes/{id}` es la receta tal como se edita: nombre, descripción, raciones, minutos,
ingredientes sin cruzar contra la despensa, pasos. `GET /recipes/{id}/availability` es el
cruce: por ingrediente, cuánto hace falta, cuánto hay, cuánto falta, y si es opcional. Son dos
casos de uso, no una opción de formato del mismo recurso.

**Por qué están separados.** Es el mismo razonamiento que ya rige `PantryTemplateController`
—el detalle de una plantilla y su reporte de compras son dos endpoints, no uno con un flag—.
Fusionarlos habría hecho que abrir una receta para cambiarle el nombre pagara siempre el cruce
contra la despensa, aunque a quien solo edita no le importe. Mantenerlos separados es también
lo que hace trivial que `GET /{id}` no necesite tocar `PantryItem` en absoluto: una consulta
menos por cada vez que alguien simplemente mira o edita una receta.

**El detalle no expone `availability` ni `missingCount`.** Si aparecieran ahí, invitarían a
leerlos como si fueran gratis, cuando en realidad son el resultado de la consulta agregada del
otro endpoint. El listado sigue trayendo los dos —`RecipeSummaryResponse`— porque ahí sí hace
falta pintar el badge de cada receta sin una llamada por fila; ver R2.

Test: `RecipeIntegrationTest.Consulta.detalleSinDisponibilidad` comprueba que el campo no
está, no sólo que valga algo distinto; `RecipeIntegrationTest.Consulta.disponibilidadConDetalle`
comprueba el cruce completo en el endpoint dedicado.

---

## R9 · `description`, `servings` y `prepMinutes` son opcionales, y positivos si llegan

Los tres se pueden omitir al crear o editar una receta —una receta a medias es un borrador
legítimo, no un error, igual que sin ingredientes ni pasos—. Cuando llegan, `servings` y
`prepMinutes` tienen que ser mayores que cero: `@Positive` dentro de Bean Validation ya deja
pasar `null` sin exigir nada, así que la misma anotación cubre las dos mitades de la regla sin
un chequeo aparte para el caso ausente.

Test: `RecipeIntegrationTest.Alta.racionesNegativas`.
