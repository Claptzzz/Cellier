# Reglas de la despensa

Las reglas del módulo de despensa y catálogo, en el mismo formato que
[reglas-hogares.md](reglas-hogares.md). Cada una dice qué se cumple, dónde vive y qué test
la sujeta.

---

## D1 · La cantidad es la suma de los movimientos

`pantry_items.quantity == SUM(stock_movements.delta)` para cada artículo, siempre.

Esto no es una consecuencia del diseño: es el diseño. La cifra que se ve en pantalla y la
bitácora que la explica son la misma cosa mirada de dos maneras. Si divergen, la bitácora
deja de ser una explicación y pasa a ser una opinión.

De aquí salen, sin decisión adicional, tres cosas que sueltas parecerían arbitrarias:

| Decisión | Por qué es forzosa |
| --- | --- |
| Consumir registra lo **gastado**, no lo pedido | Pedir 20 cuando hay 15 deja el artículo en 0. Si el movimiento dijera −20, la suma daría −5 y la cifra diría 0. |
| Un ajuste que no cambia nada **no escribe fila** | Un delta 0 no rompe la suma, pero mete ruido en la bitácora. Además `ck_stock_movements_sign` lo prohíbe. |
| El alta con cantidad registra una **compra** | Si no, el artículo nacería con una cantidad que ningún movimiento explica. |

Dónde: `PantryItem.consume/restock/adjustTo` devuelven el delta real —`null` cuando no hay
nada que registrar— y `PantryService` escribe el movimiento sólo si lo hay.

Test: `PantryQueriesIntegrationTest.Invariante.laBitacoraExplicaLaCifra`, una secuencia larga
de altas, consumos, reposiciones y ajustes sobre varios artículos que al final compara
`quantity` contra la suma de los deltas **leída por la API paginada**, no por el repositorio:
así el recorrido de páginas también queda cubierto.

---

## D2 · Relativo contra absoluto: sólo lo absoluto necesita la versión

Las escrituras de la despensa son de dos clases, y no se protegen igual.

| | Qué manda el cliente | Depende de lo que el usuario vio | Protección |
| --- | --- | --- | --- |
| `:consume` / `:restock` | un **delta**: gasté 3, repuse 6 | no | ninguna: componen |
| `PATCH` (cantidad, vencimiento, objetivo, ubicación) | un **valor absoluto**: ahora hay 12 | sí | `version` opcional |

Dos deltas componen en cualquier orden: −3 y +6 dan lo mismo se apliquen como se apliquen, y
el resultado es correcto aunque ninguno de los dos supiera del otro. Exigirles una versión los
haría fallar sin que hubiera nada que salvar.

Un valor absoluto es distinto: «ahora hay 12» es una frase sobre lo que quien la escribió
tenía delante. Si otro miembro movió el artículo entre esa lectura y esa escritura, aplicarla
tal cual **borra el cambio ajeno en silencio**. Ese es el caso que de verdad ocurre: alguien
edita en el súper mientras otro cocina en casa y descuenta.

`@Version` por sí solo no lo cubre. Sin que el cliente mande la versión que leyó, el bloqueo
optimista sólo detecta dos transacciones colisionando **en el mismo instante**, que casi nunca
pasa. Por eso `UpdatePantryItemRequest` lleva un campo `version` opcional:

- **Si llega y no es la actual** → 409, y no se toca nada.
- **Si no llega** → comportamiento de siempre, se aplica sobre lo que haya. Mantenerlo opcional
  es lo que permitió añadir la comprobación sin romper a ningún cliente existente.

El 409 tiene que ser **accionable**. El cuerpo lleva `currentVersion` y `currentQuantity`, así
que la pantalla puede decir «otro miembro lo dejó en 4» en vez de «recarga y mira tú». Un
conflicto que no dice contra qué chocaste obliga a una segunda petición para significar algo.

La única asimetría: el 409 que viene de una colisión simultánea —dos transacciones a la vez, sin
`version` de por medio— **no** puede traer esos campos, porque su transacción se deshizo. El
cliente debe manejar los dos cuerpos: con datos, dice en qué quedó; sin ellos, sólo puede pedir
que se recargue.

Dónde: `PantryService.update` comprueba la versión **antes de tocar nada**, y
`StaleWriteException` es la que lleva los datos al cuerpo, vía `ApiException.getProperties()`.

### Qué implica en pantalla

Fijado antes de escribir el stepper, porque son decisiones que se toman mal por descuido.

**Los dos cuerpos del 409 producen dos mensajes distintos, no uno genérico.**

- *Con* `currentVersion` y `currentQuantity`: «Otro miembro cambió este producto. Ahora hay
  4.» La fila se actualiza al valor recibido sin pedir nada más, y la acción del usuario se
  revierte.
- *Sin* ellos: sólo se puede recargar esa fila. **El mensaje no debe afirmar una cantidad que
  no conoce.**

**La versión que manda el campo de cantidad exacta es la que se leyó al ABRIR el campo**, no
la que tenía la fila al cargar la lista. Los toques del stepper van por `:consume` y
`:restock` y no mandan versión, pero sí la hacen avanzar: usar la vieja daría un 409 contra
los propios toques del usuario.

Test: `PantryMutationsIntegrationTest.EscrituraRancia`, cinco casos —versión vieja tras la
escritura de otro miembro, versión al día, sin versión, el consumo que la ignora, y una versión
negativa que es un 400 y no un 409—. Comprobado que el primero **falla** al quitar la
comprobación: pasa de 409 a 200 y el descuento ajeno desaparece.

---

## D3 · La unidad es parte de la identidad del producto

Un producto tiene UNA unidad canónica y todas las cantidades del sistema están en ella. No
hay conversión en ninguna capa. Comparar es una resta.

Por eso `Product` no tiene mutador de unidad, y dar de alta un artículo con una unidad
distinta de la del producto responde **409** con un mensaje que nombra las dos unidades y
ofrece la salida (crear otro producto).

---

## D4 · Sin objetivo definido, `parLevel` viaja como `null`

La banda de nivel de la despensa necesita dos cifras: cuánto hay y cuánto debería haber.
Sin la segunda no dibuja una proporción pequeña: dibuja un estado binario (hay / no hay).

`null` y `0` son estados distintos —«todavía no lo sé» contra «el objetivo es cero»— y la
API tiene que distinguirlos. Como el resto de la API omite los nulos
(`default-property-inclusion: non_null`), `PantryItemResponse.parLevel` lleva
`@JsonInclude(ALWAYS)`: el campo viene siempre, valiendo `null` cuando no hay objetivo.

Es la regla general de la sección 0 de
[frontend-orden-de-ejecucion.md](frontend-orden-de-ejecucion.md) aplicada al dominio.

Test: `PantryQueriesIntegrationTest.BandaDeNivel.sinObjetivoViajaNull` comprueba las dos
mitades por separado —que el campo **está** y que **es null**—, porque una aserción sobre el
valor sola pasaría igual si el campo se hubiera omitido.

---

## D5 · El listado sale en una sola sentencia

La despensa se lista entera, sin paginar: una despensa doméstica es corta y la banda de
nivel necesita el conjunto para ordenarse. A cambio, el listado no puede degradarse con el
número de artículos.

`PantryItemRepository.findAll(Specification, Sort)` lleva
`@EntityGraph(attributePaths = "product")`. Sin él serían 1 + N: cada fila pediría su
producto al construir la respuesta.

Test: `PantryQueriesIntegrationTest.BandaDeNivel.unaSolaSentencia` cuenta sentencias con las
estadísticas de Hibernate sobre ocho artículos y exige exactamente 2 (el guardia de
membresía y el listado). Comprobado que **falla** al quitar el grafo: sin él son 10.

---

## D6 · No tener fecha de vencimiento no es vencer muy tarde

`sort=EXPIRY` ordena por fecha ascendente con los nulos **al final**. Un artículo sin
vencimiento no es uno que vence en el año 9999: es uno que no participa de esa pregunta, y
ponerlo al final es la forma de decirlo sin inventarle una fecha.

Mismo razonamiento que D4, aplicado al orden en vez de a la serialización.

Dónde: el enum `PantryService.PantrySort`. Los tres órdenes llevan un segundo criterio
estable (`id` o `product.name`) para que dos artículos empatados no bailen entre peticiones.

---

## D7 · Un artículo ajeno no existe

Todas las rutas cuelgan de `/households/{householdId}/…` y pasan por
`HouseholdAccessService` antes de tocar datos. Sobre eso, el artículo se busca con
`findByIdAndHouseholdId`: emparejar los dos identificadores es lo que impide alcanzar un
artículo ajeno desde un hogar propio.

Hogar ajeno y hogar inexistente responden **404 con el mismo mensaje**; artículo ajeno y
artículo inexistente, también. Verificado contra la base real: los dos casos devuelven
`No existe ese hogar, o no eres miembro de él.`

En el esquema lo sujeta la clave foránea compuesta `(product_id, household_id)` de
`pantry_items` — sección 1 de [reglas-esquema.md](reglas-esquema.md).

---

## D8 · Lo que la pantalla de despensa no puede decir con color

Reglas de la interfaz, no de la API. Las tres salen de mirar capturas, no de suponer.

**El aviso de vencimiento nunca se codifica sólo por tono.** `--warn` y `--danger` tienen
luminancias casi idénticas, así que en escala de grises son el mismo gris. Lo que separa
«Vence en 2 días» de «Venció ayer» es el **icono** del Badge —triángulo contra círculo con
aspa, máxima diferencia de silueta a 14px— y el **texto**, que además difiere palabra por
palabra. Verificado en captura con un filtro de grises sobre la lista real.

**Sin nivel objetivo, la banda no puede pintarse de `--ok`.** Se hizo así al principio y la
captura lo desmintió: la lechuga sin objetivo salía con la banda entera en verde, la más
alta y la más viva de la lista, por encima de un arroz medido al 75%. El artículo del que
menos se sabe se veía como el mejor surtido. Ahora el relleno sin objetivo es neutro
(`--border-strong`) y la etiqueta accesible deja de decir un porcentaje: dice «hay
existencias, sin nivel objetivo definido».

**Límite conocido, sin arreglo dentro de la banda.** En escala de grises, esa banda neutra a
plena altura no se distingue de una llena de verdad. No se arregla con textura: el sistema de
diseño ya registra que a 4px de ancho ni el rayado ni la muesca se leen. El canal redundante
es el texto de la fila, que dice la cantidad y su unidad. Se deja escrito en vez de fingir que
la banda sola basta.

---

## D9 · Cargando, vacío, sin resultados y roto son cuatro pantallas

Comparten hueco y no se pueden confundir. `PantryStore` guarda `null` mientras no ha cargado
nunca, que es distinto de `[]`:

| Estado | Cuándo | Qué se pinta |
| --- | --- | --- |
| Cargando por primera vez | `null` y petición en curso | Skeletons con la forma de la fila |
| Recargando | ya hay datos y hay petición | La lista anterior, marcada `aria-busy` |
| Vacía | cargado, sin filtros, sin nada | Estado vacío diseñado, **sin buscador** |
| Sin resultados | cargado, con filtros, sin nada | Otro texto, y «Quitar filtros» como salida |
| Rota | la petición falló | Qué pasó y un reintento |

Dos consecuencias que costaron una captura cada una:

- **Con la despensa vacía no se pinta el buscador.** Ocupa el sitio de lo único que esa
  pantalla tiene que decir, y sugiere que lo que falta podría estar escondido tras un filtro.
- **El fallo lo cuenta la pantalla, no el interceptor.** `PantryApi` marca el listado con
  `SKIP_ERROR_TOAST`. Sin eso salían las dos cosas: un toast genérico —«Algo salió mal»—
  encima de un mensaje que ya dice qué pasó, qué hacer, y algo que el toast no puede decir:
  que lo guardado sigue a salvo.

Una recarga por cambio de filtro **no** vuelve a los skeletons. Cambiar a esqueletos en cada
tecla del buscador haría parpadear la pantalla entera; la lista anterior se queda puesta
hasta que llega la nueva, y las peticiones que quedan obsoletas se cancelan para que una
respuesta lenta no pinte el filtro que ya se abandonó.

---

## D10 · Cómo escribe la pantalla: optimista, agrupada y en fila

Tres propiedades del camino de escritura. Las tres salen de D1 y D2, no de preferencias.

**Optimista.** El gesto es el de una estantería: tocas −1 y la cifra baja. Esperar a la red
para mover un número convierte un gesto físico en un trámite. Si la escritura falla, se
deshace exactamente lo que se pintó y se dice por qué.

**Agrupada.** Seis toques seguidos son una sola intención. Se acumulan 600 ms y sale **una**
llamada con el neto. Verificado contra la base real: doce huevos, seis toques, y la bitácora
tiene una fila —`CONSUMPTION −6`—, no seis. Si el neto es cero —tocaste +1 y luego −1— no se
manda nada: no pasó nada que contar, y `ck_stock_movements_sign` lo rechazaría igualmente.

**En fila, por artículo.** Las dos clases de escritura de D2 no pueden salir a la vez. Un
toque es relativo; un número tecleado es absoluto y viaja con la versión. Si se solaparan, el
absoluto usaría una versión que el relativo está a punto de invalidar y el usuario recibiría
un conflicto **contra sí mismo**. Por eso la versión se lee al **salir** la petición, no al
abrir el campo: para entonces los toques propios ya pasaron por esa misma fila.

### Dos detalles que sólo se ven mirando

**La respuesta no pisa la cifra, se suma a lo que falte por mandar.** Si llega la respuesta de
un toque mientras hay otro sin salir, escribir la cantidad del servidor a secas haría saltar
el número hacia atrás en la mano del usuario. Lo que se pinta es `servidor + pendiente`.

**El campo editable no lleva separador de miles.** `1.500` vuelve a entrar al confirmar, donde
el punto se lee como decimal, y 1500 g de arroz pasarían a 1,5. El separador se queda para lo
que sólo se lee.

### El conflicto, contra el backend real

Ana ve 6, Bruno se lleva 4 desde su sesión, Ana escribe 10 partiendo de lo que tenía delante:

```
PATCH -> 409
la fila pasa a decir 2, sin pedir la lista otra vez
aviso: «Otro miembro cambió Huevos — Ahora hay 2 un. Tu cambio no se aplicó.»
```

En la base no queda rastro del intento de Ana: `PURCHASE 12`, `CONSUMPTION −6`,
`CONSUMPTION −4`, cantidad 2. Es lo que da comprobar la versión **antes** de tocar nada; si se
comprobara después, el ajuste ya habría escrito su movimiento y el historial mentiría sobre
una operación rechazada.

---

## D11 · Agregar: la unidad se elige una vez, y sólo cuando hay que elegirla

El alta busca en el catálogo del hogar mientras se escribe. De ahí salen tres caminos, y la
pantalla no puede afirmar dos a la vez:

| Lo que hay | Lo que se pregunta |
| --- | --- |
| Se elige una sugerencia | Nada: la unidad viene con el producto y se muestra, no se edita |
| El nombre escrito coincide **exacto** con uno del catálogo | Nada: escribirlo entero **es** elegirlo |
| No hay sugerencias, o se pulsa «Crear «X»» | La unidad, avisando de que no se podrá cambiar |

**La tercera fila es una opción, no una deducción.** Una primera versión enseñaba tres
resultados para «leche» y a la vez decía «"leche" es nuevo en este hogar»: dos afirmaciones
contrarias en la misma pantalla. Ahora crear es una fila más al final de la lista, y la elige
el usuario.

**La segunda fila evita un conflicto que el usuario no provocó.** Tratar un nombre exacto como
producto nuevo lo mandaría con la unidad por defecto y el servidor respondería 409 por un
choque de unidades que nadie pidió.

Efecto secundario que conviene saber: con esto, **el 409 de unidades ya no se alcanza desde la
interfaz**. Queda como red ante una carrera —otro miembro crea el producto entre la búsqueda y
el envío—, y está cubierto por test, no por la pantalla.

El otro conflicto del alta sí se alcanza y se comprobó contra el backend real: agregar algo que
ya está en la despensa responde 409 y el mensaje se pinta **bajo el campo del nombre**, con la
salida que da el servidor —usar reponer, o editar—, no en un toast que taparía el formulario.

---

## D12 · El detalle explica la cifra; el modo súper la llena

Dos pantallas nuevas, las dos con la misma justificación: la lista responde **cuánto queda**,
y hay dos preguntas que no cabe responder ahí.

### El detalle: por qué la cifra es esa

La bitácora de D1 puesta donde alguien la puede leer. Se pide **al abrir el detalle**, nunca
al cargar la lista: son datos que se miran una vez al mes, y traerlos para los treinta
artículos de una despensa sería pagar por adelantado algo que casi nadie usa.

Se pagina de diez en diez. Al cambiar de artículo, el historial se vacía **antes** de pedir el
nuevo: en el hueco entre abrir y responder, los movimientos de los huevos bajo el nombre de la
lechuga serían una mentira que además cuadra, porque son movimientos de verdad de otra cosa.

Verificado contra el backend real, con dos personas moviendo el mismo artículo:

```
Huevos  9 un  de 12
  Se corrigió · Ana Rivas   +1
  Se gastó · Bruno Soto     −4
  Se agregó · Ana Rivas    +12
```

### El modo súper: sin cerrar entre producto y producto

Vaciar una bolsa son ocho productos seguidos. El flujo normal —abrir, buscar, sumar, cerrar—
cobra cuatro gestos por cada uno; aquí el panel no se cierra y el campo vuelve a quedar listo.

- **Se filtra en memoria.** La despensa entera ya está cargada y no se pagina; una ida y vuelta
  por letra sería un retraso sin nada que ganar.
- **Sólo suma a lo que ya existe.** Un producto nuevo necesita decidir su unidad, que es una
  decisión con consecuencias (D3) y no cabe en un flujo de ocho seguidos. Lo que no está se
  manda a «Agregar producto».
- **Cada suma va por `restock`**, relativo: compone con lo que cualquier otro miembro haga a la
  vez, sin versiones ni conflictos (D2).
- **El resumen agrupa por producto.** Dos cartones de huevos son «+2», no dos líneas que haya
  que sumar de cabeza.

**Contrapartida aceptada:** las escrituras salen por el mismo camino que un toque del stepper,
así que se agrupan sólo si caen dentro de la misma ventana de 600 ms. A ritmo humano, dos
cartones seguidos dejan **dos movimientos de +1** en vez de uno de +2. Los dos dicen la verdad
y el invariante cuadra igual; agrupar toda la visita en una escritura por producto habría
pedido un camino especial en el estado, y no valía el precio.

