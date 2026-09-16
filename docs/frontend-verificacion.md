# Verificación del frontend

- **Ámbito:** `frontend/`
- **Actualizado:** 2026-09-14

Qué hay que ejecutar antes de dar por terminado un incremento que toque el frontend. No es
una lista de buenas intenciones: cada script existe porque una clase concreta de fallo se
coló sin él, y varios cazaron bugs en código que ya había pasado revisión.

## La lista

| Script | Qué comprueba | Cuándo |
|---|---|---|
| `npx ng test --no-watch` | Lógica de servicios y guards | Siempre |
| `scripts/verify-reachability.mjs` | Que toda pantalla tenga camino de navegación | **Siempre** |
| `scripts/shots.mjs` | Matriz de capturas: 375 y 1440, claro y oscuro, sin desbordes | Cualquier cambio visual |
| `scripts/verify-routing.mjs` | Redirecciones, guards y el 404 indistinguible | Rutas o guards |
| `scripts/verify-startup.mjs` | Que ningún fallo de arranque deje la pantalla en blanco | Arranque de sesión |
| `scripts/verify-member-menu.mjs` | Geometría del panel anclado en la última fila con scroll | `ui-menu` o listas con acciones |
| `scripts/check-templates.mjs` | Acentos graves dentro de los template literals | Si el error de `@Component` no tiene sentido |
| `npx ng build --configuration production` | Que compile y cuánto pesa | Siempre |

Los que necesitan navegador esperan un servidor en marcha: `npx ng serve --port 4300` y se les
pasa esa URL.

## Por qué `verify-reachability` es obligatorio

Una ruta puede estar declarada, con su guard y su componente, y **no tener ningún enlace ni
botón que lleve a ella**. Funciona escribiendo la URL, así que en desarrollo —donde siempre se
llega escribiendo la URL— parece terminada.

El módulo de hogares pasó cuatro revisiones antes de que alguien lo ejecutara. Encontró
**cuatro pantallas huérfanas**, dos de ellas graves: Ajustes no tenía ningún acceso por debajo
de 1024 px, y **cerrar sesión no lo invocaba nadie en toda la aplicación**.

Ninguna se ve leyendo el código, porque el código de cada pantalla está bien. Lo que falta es
una arista del grafo de navegación, y eso sólo se ve recorriéndolo.

## Deuda: `verify-reachability` tarda 20 minutos

Es obligatorio y tarda demasiado, y una comprobación obligatoria que tarda demasiado se deja
de ejecutar. Así murieron las comprobaciones manuales de este proyecto antes de convertirse
en scripts; el riesgo aquí es el mismo un nivel más arriba.

**De dónde sale el tiempo.** Medido sobre el recorrido de 8 pantallas × 2 anchos:

| Causa | Coste | Arreglo |
|---|---|---|
| `page.goto` antes de **cada** control | ~1 s de arranque completo de la SPA por control | `page.goBack()`: la vuelta es navegación de cliente, no un arranque |
| Esperas fijas de 800 + 600 + 450 ms | ~1,85 s por control, siempre, se necesiten o no | `waitForURL` / esperar a que el DOM cambie, con tope |

Son ~144 controles entre los dos anchos, así que las dos causas juntas son casi todo el
tiempo. Quitarlas debería dejarlo en dos o tres minutos.

Mientras tanto lleva una línea de progreso a stderr. No lo arregla: sólo evita que se mate
creyendo que está colgado, que es lo que pasó la primera vez.

## Idea: que el recorrido detecte controles sin efecto

`verify-reachability` comprueba que toda **pantalla** tenga camino, no que todo **control**
tenga destino. Un botón sin acción es la versión pequeña de una pantalla huérfana, y ya van
dos: el FAB de la despensa y el avatar de la cabecera del Incremento 4.

El recorrido ya pulsa cada control y compara la ruta antes y después; le faltaría anotar los
que no cambian nada —ni ruta, ni DOM, ni petición— y listarlos aparte. **Valorarlo al arreglar
los 20 minutos**, no antes: añadir trabajo a un script que ya tarda de más es la forma más
rápida de que deje de ejecutarse.

## Resuelto: el FAB ya hace algo

Existía desde el Incremento 3 sin acción. Cableado en el PR C de la despensa, y **movido** del
chasis a la pantalla: el botón que agrega un artículo pertenece a la pantalla que tiene
artículos. Teniéndolo ahí, el chasis deja de adivinar en qué sección está para decidir si lo
pinta; sólo le guarda el sitio en la franja inferior, que es lo que sí le toca.

Queda el otro control muerto que sigue vivo: el **avatar de la cabecera** del Incremento 4.

## Un componente no está verificado hasta que se captura ABIERTO

Estar en `/dev/ui` no basta. Un componente con estado activo, en reposo, es otra cosa: un
`<dialog>` cerrado no ocupa nada, y un `toast-host` sin avisos es un contenedor vacío. La
captura de la galería los enseña a los dos, y no dice nada de ninguno.

Ya van **dos componentes rotos durante meses** en su estado activo, los dos en `shared/ui`,
los dos descubiertos el día que alguien los capturó abiertos:

| Componente | Qué estaba roto | Cuándo se vio |
| --- | --- | --- |
| `ui-bottom-sheet` | `position: fixed` la sacaba del top layer y el panel acababa en y = −266 | Incremento 4 |
| `ui-dialog` | sin `margin: auto` se pegaba a la esquina superior izquierda | Incremento 6 |

En los dos casos el fondo atenuado sí se pintaba, así que desde fuera parecían funcionar.

**La regla.** Todo componente con estado activo necesita su captura EN ese estado, en la
matriz de 375/1440 × claro/oscuro. Al añadir uno nuevo con estado, la captura entra en el
mismo PR.

### La captura no es la comprobación (Incremento 8)

El menú de acciones de la lista de plantillas abría, en 1440, una banda a todo lo ancho
pegada al borde inferior, encima del sidebar. La escena `plantillas-acciones` **existía**
desde el primer PR, en las dos anchuras y los dos temas, y **el fallo salía en el PNG**. No
falló nada porque lo único que la escena medía era `overflowPx`, y un panel de 1440 px de
ancho dentro de un viewport de 1440 px no desborda. Lo encontró una persona usando la
aplicación, semanas después.

Una fotografía no es una afirmación. Capturar un componente abierto es condición necesaria y
no suficiente: **toda escena que abra algo flotante tiene que afirmar dónde está**. Como
mínimo: dentro de vista, `elementFromPoint` en su centro cae dentro de él, y —si es un panel
anclado— pegado al disparador y no a la pantalla. El detalle técnico está en la sección 10
de `frontend-orden-de-ejecucion.md`.

Desde este incremento, `shots.mjs` además **falla si una escena produce un error de
consola**. Es el canal por el que Angular reporta las excepciones de dev: la comprobación que
`ui-menu` hace de su propio `offsetParent` llega por ahí, no por `pageerror`.

### Inventario, revisado en el Incremento 6

| Componente | Estado activo | Capturado |
| --- | --- | --- |
| `ui-dialog` | abierto | `despensa-agregar-*-1440-*` |
| `ui-bottom-sheet` | abierta | `despensa-agregar-*-375-*`, `switcher-open-375-*` |
| `ui-menu` | abierto | `switcher-open-1440-*`, `account-menu-*`, `manage-confirm-*` |
| `ui-icon-button` | `pressedState` | `manage-confirm-*`, dentro de la fila de miembro |
| `ui-toast-host` | con avisos | `toasts-*` — **faltaba, añadido aquí** |

El resto de `shared/ui` —`badge`, `button`, `card`, `empty-state`, `icon`, `input`,
`level-band`, `quantity-stepper`, `select`, `skeleton`— no tiene estado activo propio: lo que
se ve en reposo es todo lo que hace. `ui-select` abre la rueda del sistema operativo, que no
es suya ni se puede capturar.

## Todo patrón de interceptación se ancla en `/api/`

`page.route('**/templates**', …)` no intercepta sólo la API: **también intercepta la
navegación** a `/h/:id/templates`, porque el documento es una petición como cualquier otra.
El resultado es que `page.goto` se queda esperando para siempre y el fallo no dice nada del
patrón:

```
page.goto: Timeout 30000ms exceeded.
  - navigating to ".../h/8c2b7e14-…/templates", waiting until "commit"
```

**La convención: el patrón empieza en `**/api/`.** No «cuando choque», sino desde el primer
día, porque el choque depende de qué rutas tenga la aplicación **en ese momento** y eso
cambia sin que nadie mire el arnés.

| En vez de | Escribe |
|---|---|
| `**/members` | `**/api/v1/households/*/members` |
| `**/pantry/items**` | `**/api/v1/households/*/pantry/items**` |
| `**/products**` | `**/api/v1/households/*/products**` |
| `**/join-requests**` | `**/api/v1/**/join-requests**` |

**Por qué se revisaron todos de golpe.** Sólo `templates` chocaba el día que se descubrió:
los demás se salvaban por casualidad, porque ninguna ruta de la aplicación contenía esas
palabras. La siguiente mina estaba puesta y con fecha: `/h/:id/recipes` existe desde el
Incremento 3, y el primer `**/recipes**` que alguien escribiera en el Incremento 9 habría
colgado el arnés igual. Se acotaron los 24 patrones del arnés de una vez.

## Deuda: el arnés puede capturar un bundle viejo sin decirlo

`ng serve` en modo vigilancia **se queda sirviendo la última compilación buena** cuando una
posterior falla. El error va a su propia consola; la aplicación sigue respondiendo con
normalidad, y `shots.mjs` captura tan feliz una versión que ya no es la del código.

Pasó en el Incremento 8: se revisaron capturas de un editor que no tenía el cambio recién
hecho, y sólo se descubrió midiendo el elemento en el navegador y viendo que sus clases eran
las de antes.

**Mientras tanto, la costumbre:** si una captura no muestra un cambio que sí está en el
archivo, mira la consola de `ng serve` **antes** de tocar el CSS. Y ante la duda, mide en el
navegador en vez de mirar el PNG: un `getBoundingClientRect` no se equivoca de bundle.

**El arreglo de verdad** es que el arnés compruebe que lo servido es lo actual —compilar
antes de capturar, o leer el error de la consola de `ng serve`— y falle si no lo es. Va con
la misma revisión que los 20 minutos del recorrido: las dos son deuda del arnés, no del
producto.

**Pasó tres veces en el Incremento 8.** La tercera costó una hora revisando capturas de un
arreglo que sí funcionaba: `min-height: 44px` estaba aplicado y medía 335×44 en el navegador,
y el arnés seguía diciendo 43.

### Resuelto: el arnés comprueba la frescura antes de capturar

No basta con mirar el DOM: hay que **obligar al servidor a demostrar que puede recompilar**.

1. `sync-environment.mjs` calcula una huella `sha256` del árbol `src/` —excluyendo
   `src/environments/`, que depende de ella— y la escribe como `buildStamp` en el fichero de
   entorno generado.
2. `main.ts` la publica en `<html data-build>`.
3. `shots.mjs`, antes de nada, **regenera el fichero de entorno** y espera hasta 40 s a que la
   página anuncie esa misma huella. Si el árbol cambió, la huella cambia, el fichero cambia y
   el servidor tiene que recompilar para converger.

Si no converge, no hay capturas: el script muere nombrando las dos huellas. Y si encuentra
`<vite-error-overlay>` en el DOM, muere diciendo que el servidor tiene un error de compilación
y que mire su propia consola.

La gracia de que sea una huella del contenido y no una fecha es que **no genera ruido**: si
nadie tocó nada, la huella ya coincide y la comprobación pasa sin recompilar. Sólo exige algo
cuando de verdad hay algo nuevo que servir.

Falsificado: con un error de tipos metido a mano en `pantry-row.ts`, el arnés sale con

```
Error: Lo servido no es lo que hay en disco: la pagina anuncia 83f2dcfb404a y el arbol de
fuentes es 7b9a7c950e52. El servidor no ha conseguido recompilar en 40s.
```

## Una herramienta que sólo sabe decir que sí no se distingue de una rota

Es la lección del Incremento 8, y vale para todo lo que hay en `scripts/`.

El recorrido llevaba **meses en verde con dos fallos que se compensaban**. No estaba mintiendo
a propósito: cada vez que no podía pulsar un control, seguía adelante sin decirlo, y el
resultado era un informe correcto sobre una exploración incompleta.

### Regla 1 · Un caso que no se puede comprobar es un error, nunca una omisión

Si el script no encuentra el control, no puede medir el elemento o la petición no llega, eso
**se reporta y hace fallar**. No hay `continue` silencioso, ni `?? null` que acabe en un
informe de éxito.

Lo contrario tiene un coste que no se ve: la comprobación sigue en la lista, sigue tardando,
y sigue dando confianza. Es peor que no tenerla, porque nadie va a escribir otra.

### Auditoría de `shots.mjs`, Incremento 8 · qué afirma cada escena

Si teníamos la prueba guardada en disco y nada obligaba a mirarla, entonces las 192 capturas
afirman menos de lo que parecía. Esto es el recuento, escena por escena. La puerta de salida
del script sólo mira dos cosas: `overflowPx` distinto de cero, y `problemas` no vacío. Todo lo
demás que el script calcula se imprime y se olvida.

| Grupo | Capturas | Qué afirma, además de `overflowPx` |
| --- | ---: | --- |
| `login`, `shell-pantry`, `dev-ui` | 12 | nada |
| `zoom200` | 2 | nada (`note` es texto, no comprobación) |
| `band-{color,grayscale,deuteranopia}` | 6 | que la sección de la banda se pinta |
| `switcher-{open,closed}` | 8 | exactamente un disparador visible y un panel visible |
| `onboarding-*` (6 escenas) | 24 | nada |
| `home`, `account-menu` | 8 | nada |
| `manage-*` (5 escenas) | 20 | nada |
| `despensa-*` (12 escenas) | 48 | **área táctil de cada control contra `--touch-min`**, y el número de filas contra lo que la escena declara |
| `despensa-gris` | 2 | que quedan filas y que siguen teniendo icono sin color |
| `toasts` | 4 | que los tres avisos pulsados están visibles |
| `plantillas-*` (5 escenas) | 20 | errores de consola; y `plantillas-acciones` (4), la geometría del panel |
| `editor-*` (5 escenas) | 20 | errores de consola |
| `reporte-*` (5 escenas) | 17 | errores de consola; y `reporte-impresion` (1), la hoja `@media print` |
| `fab-clearance` | 1 | el botón flotante no tapa la última fila |

**El recuento, antes y después del Incremento 8:**

| | Antes | Después |
| --- | ---: | ---: |
| Fotografías: desbordamiento o nada | 74 | 66 |
| Calculan algo y no lo comparan | 52 | 0 |
| Afirman sólo «no hubo error de consola» | 57 | 52 |
| **Afirman algo real sobre lo que se ve** | **14** | **74** |

Las 52 que calculaban sin comparar eran la peor categoría: daban la impresión de que había una
comprobación donde sólo había un número impreso. Dos ejemplos de lo que escondían:

- `toasts` contaba `[role="status"], [role="alert"]` en toda la página y daba **15**, no 3:
  cada `ui-skeleton` lleva `role="status"` y cada `ui-input` un `role="alert"`. El número
  llevaba dos incrementos impreso y no medía lo que su nombre decía.
- `altoFila` no es un área táctil. Una fila mide 87 o 149 px, así que compararla contra 44
  habría pasado siempre: habría sido una comprobación vacua con aspecto de comprobación. Lo
  que se mide ahora son los **controles**, uno a uno. El campo de búsqueda mide 44 px
  exactos, o sea que el límite está vivo.

### Deuda con nombre · los ADR 001–008 no existen como ficheros

`docs/adr/` contiene tres ficheros: `009`, `010` y `011`. Los ocho anteriores **existen sólo
como tabla en el documento de arquitectura** y se han venido dando por escritos. No es un
efecto del `docs/` ignorado: un `.gitignore` no borra ficheros.

Se escriben en el **Incremento 13**, el de documentación, con el formato
Contexto / Decisión / Consecuencias que usan los tres que sí existen. No se generan antes: una
decisión reconstruida a posteriori sin su contexto es peor que la tabla que ya hay.

### Deuda con nombre · un incremento de arnés y sistema de diseño, antes del 12

Dos cosas van juntas porque se arreglan en el mismo sitio y con la misma cabeza:

**1. Las 66 fotografías.** Las capturas de `login`, `shell-pantry`, `dev-ui`, `zoom200`,
`onboarding-*`, `home`, `account-menu` y `manage-*` siguen sin afirmar nada más allá del
desbordamiento horizontal. **No se arreglan con fontanería**: cada pantalla necesita que
alguien decida qué hay que garantizar de ella, y eso es diseño. El orden razonable empieza por
donde ya ha aparecido un fallo de colocación —paneles, hojas, diálogos, menús—, que es lo que
señala la sección 11 de `frontend-orden-de-ejecucion.md`. `manage-*` (20 capturas, con
`ui-menu` por fila) y `account-menu` (4) son las primeras candidatas: llevan el mismo
componente que ya falló en la lista de plantillas.

**2. Unificar el botón de lista de `shared/ui`.** El mismo bloque de CSS está copiado en
`add-item-panel` (`.sugerencia`), `restock-run-panel` (`.opcion`) y `template-editor-page`
(`.sugerencia`). Los tres tenían el mismo píxel de menos y hubo que arreglarlo tres veces.
Debe ser una clase sola.

---

### Deuda con nombre · las 66 fotografías (detalle)

Las 66 capturas de `login`, `shell-pantry`, `dev-ui`, `zoom200`, `onboarding-*`, `home`,
`account-menu` y `manage-*` siguen sin afirmar nada más allá del desbordamiento horizontal.

**No se arreglan con fontanería.** Cada pantalla necesita que alguien decida qué hay que
garantizar de ella, y eso es diseño. Es un incremento propio, **antes del 12**. El orden
razonable es empezar por las pantallas donde ya ha aparecido un fallo de colocación —paneles,
hojas, diálogos, menús—, que son exactamente las que la sección 11 de
`frontend-orden-de-ejecucion.md` señala. `manage-*` (20 capturas, con `ui-menu` por fila) y
`account-menu` (4) son las primeras candidatas: tienen el mismo componente que ya falló en la
lista de plantillas.

### Corolario · La comprobación nueva se audita el mismo día que se escribe

Las dos comprobaciones que se añadieron a `plantillas-acciones` nacieron con una omisión
silenciosa cada una, y las dos se vieron sólo porque se ejercitó el caso que debe fallar:

| Omisión | Por qué se contestaba sola |
|---|---|
| `querySelector('.ui-sheet-panel')` | Devolvía la hoja **cerrada** del selector de hogar, que va antes en el DOM. Hay que anclar en `dialog.ui-sheet[open]`. |
| «¿la hoja tapa la navegación?» con `aside a` | En 375 ese enlace existe con caja de 0×0, así que la sonda medía en (0,0) y devolvía `null`. Ahora se coge el primer enlace **visible**, y no encontrar ninguno es un fallo. |

Escribir la comprobación y verla pasar no prueba nada. Sólo prueba algo verla fallar.

### Regla 2 · Cada script necesita un caso que DEBE fallar, ejercitado de vez en cuando

Lo mismo que ya se hace con los tests —quitar la protección y ver caer el test— aplicado al
arnés. Si al romper a mano lo que el script vigila el script sigue en verde, el script no está
midiendo.

Registro de la última vez que se comprobó cada uno:

| Script | Cómo se rompe a mano | Comprobado |
|---|---|---|
| `shots.mjs` | Quitar la reserva de hueco del `<main>` → el botón flotante tapa la última fila | Incremento 8 ✓ |
| `shots.mjs` (menú anclado) | Quitar el `relative` de la fila de plantillas → 8 fallos nombrados en 1440 | Incremento 8 ✓ |
| `shots.mjs` (hoja modal) | `showModal()` → `show()` en `ui-bottom-sheet` → la navegación queda `ALCANZABLE` | Incremento 8 ✓ |
| `shots.mjs` (área táctil) | No hizo falta romperlo: al escribirlo encontró dos incumplimientos reales en la despensa | Incremento 8 ✓ |
| `shots.mjs` (frescura) | Un error de tipos en `pantry-row.ts` → el servidor no converge y el arnés muere nombrando las dos huellas | Incremento 8 ✓ |

**Lo que encontró la comprobación de área táctil el primer día**, y que hay que decidir aparte
porque es producto, no arnés:

| Control | Medida | Estado |
| --- | --- | --- |
| `.sugerencia`, `.opcion` — **tres copias del mismo bloque** | 335×43 y 438×43 | **Arreglado** en el Incremento 8, en los tres sitios |
| El `<input>` de `ui-quantity-stepper` | 70×24 | **Abierto**, con la medición hecha. Va en su propio cambio |

El de 43 px no era un fallo: era **el mismo bloque de CSS copiado en tres componentes**
—`add-item-panel`, `template-editor-page` y `restock-run-panel`—, con el mismo
`padding: 0.625rem` que suma 43 y sin `min-height`. Arreglar el primero dejó los otros dos
intactos, y sólo el segundo lo delató el arnés: las escenas del editor no miden áreas
táctiles todavía, así que esa copia habría seguido rota sin que nada lo dijera.

**Un mínimo escrito manda más que un relleno que casualmente suma**, y tres copias de un
estilo son tres sitios donde arreglar el mismo píxel. Unificarlo en una clase compartida es
deuda razonable para cuando se toque `shared/ui`.

La regla de las áreas táctiles existe desde el Incremento 2 y nunca se había verificado. La
primera vez que se verifica, no se cumple en dos sitios.

**`shots.mjs` sale con código 1 mientras el segundo siga abierto.** Un arnés que señala un
incumplimiento real y al que se silencia es peor que no tenerlo.

#### Lo que costaría cada opción para el campo del stepper

Medido en la despensa y en `/dev/ui`, a 375 px, a 1440 px y a 188 px —que es el viewport CSS
al 200 % de zoom, el caso que el propio componente dice tener en cuenta—:

| Opción | Campo a 375 | Campo a 188 (zoom 200 %) | Alto de grupo | Alto de fila a 375 |
| --- | --- | --- | --- | --- |
| Actual | 70×24 | 44×24 | 50 | 148,5 |
| A · el campo estira en su columna | 70×**37** | 44×**37** | 50 | 148,5 |
| B · `min-height: 44px` al campo | 70×44 | 44×44 | **57** | **155,5** |
| C · número y unidad en la misma línea | 61×48 | **29**×48 | 50 | 148,5 |
| **D · la unidad sale del flujo y el campo estira** | **70×48** | **44×48** | 50 | **148,5** |

- **A no llega**: la unidad sigue ocupando altura en la columna, así que el campo se queda en
  37 px. Sin coste y sin beneficio.
- **B cumple pero la fila crece 7 px** a 375 (148,5 → 155,5, un 4,7 %). A 1440 no crece, porque
  ahí hay holgura vertical de sobra. La despensa es lo más denso del producto y la fila es su
  unidad de repetición.
- **C parecía gratis y no lo es.** A 200 % de zoom el centro ya está estrechado a 44 px
  —el componente cede el centro a propósito para que los botones no bajen de 44—, y meter la
  unidad en esa misma línea deja el campo en **29 px de ancho**. Cambia un incumplimiento de
  alto por uno de ancho, peor.
- **D cumple sin mover nada.** La unidad pasa a `position: absolute` en el centro y el campo
  estira a los 48 px del grupo, con `padding-bottom` para que el número siga donde estaba.
  70×48 a 375 y 44×48 a 188; alto de grupo y de fila idénticos; sin desbordes; ningún valor
  se corta. Visualmente la única diferencia son 2 px en la posición de la unidad.

Respuesta a la pregunta: **sí, el campo puede ocupar los 48 px del grupo sin mover nada más**,
pero no por el camino evidente. Hay que sacar la unidad del flujo, no estirar el campo dentro
de él.
| `verify-reachability.mjs` | Quitar el enlace de una fila de la lista → esa pantalla sale huérfana | Incremento 8 ✓ |
| `verify-routing.mjs` | — | pendiente |
| `verify-startup.mjs` | — | pendiente |
| `verify-member-menu.mjs` | — | pendiente |

### Auditoría de omisiones silenciosas, Incremento 8

Se revisaron los cinco. Dos hallazgos, los dos en `shots.mjs`:

1. **La holgura del botón flotante llevaba desde el Incremento 4 midiendo `null`.** Apuntaba a
   `/dev/ui`, donde ese botón no existe —sólo lo pinta la despensa—, y además buscaba una
   etiqueta que cambió en el Incremento 6. Devolvía `{ fab: null }` y el script lo imprimía
   tan contento. Nunca comprobó nada. Ahora mide en la despensa, con filas de verdad, y falla
   si no encuentra el botón, la barra o las filas.

2. **`shots.mjs` no tenía código de salida.** Medía el desbordamiento horizontal de 175
   capturas y lo imprimía; detectarlo dependía de que una persona leyera el JSON con atención.
   Ahora falla con la lista de los que desbordan.

`verify-routing`, `verify-startup` y `verify-member-menu` **sí** cuentan fallos y salen con
código distinto de cero; sus caminos de `?? null` terminan en una línea `FALLA`. No se
encontró omisión silenciosa en ellos, pero les falta el caso que debe fallar de la regla 2.

## Dos agujeros que tenía el propio recorrido

Encontrados en el Incremento 8, al añadir una pantalla nueva que el recorrido declaraba
huérfana teniendo camino. Los dos fallaban **en silencio**: el script no se caía, sólo
exploraba menos de lo que decía explorar.

### 1. El nombre se calculaba de una forma y se buscaba de otra

`controles()` leía `textContent`; `pulsar()` buscaba por **nombre accesible**. No son lo
mismo: `textContent` concatena sin separador, así que un enlace con dos `<span>` da

```
textContent:      "Compra semanal2 productos · Ana Rivas"
nombre accesible: "Compra semanal 2 productos · Ana Rivas"
```

La búsqueda exacta no encontraba nada, `pulsar` devolvía `false` y el control se saltaba sin
dejar rastro. **Arreglo:** `innerText`, que mide el texto renderizado, que es de donde sale el
nombre accesible.

### 2. Al abrir un panel, se paraba en el primer hijo que navegaba

El recorrido pulsaba un control; si no navegaba, miraba qué ofrecía dentro y **cortaba al
primer hijo que llevara a algún sitio**. Un panel con varios destinos aportaba uno solo.

Lo grave es cómo se descubrió: al arreglar el fallo 1, `/onboarding` pasó a salir **huérfana**.
Llevaba meses saliendo alcanzable *por accidente* —el único hijo del selector de hogar que el
recorrido conseguía pulsar era justo el que llevaba allí, porque los otros tenían el nombre
mal calculado—. Dos fallos que se tapaban el uno al otro.

**Arreglo:** se prueban todos los hijos, y cada uno desde cero —volver a la pantalla, volver a
abrir el panel—, porque pulsar uno cierra el panel o se lleva la navegación.

**Coste:** el recorrido tarda más, y ya tardaba de más. Suma a la deuda de arriba en vez de
restarle; se arreglan juntas.

## La red de seguridad de los fixtures

Los scripts con navegador responden vacío a cualquier petición a `/api` que no esté simulada,
**y anotan su ruta**.

Hizo falta porque un endpoint nuevo sin mock salía al backend real, devolvía 401, el
interceptor intentaba refrescar con un token de mentira y **cerraba la sesión**: todos los
casos terminaban en `/login` y el fallo parecía del producto. Pasó tres veces antes de
arreglarse así. Ahora el script dice qué mock falta en vez de fallar por otro sitio.

## Las trampas conocidas

`frontend-orden-de-ejecucion.md` recoge las seis que ya costaron un bug: estados «vacío» contra
«no lo sé», redirecciones antes que guards, señales obsoletas dentro de un guard, el arranque
bloqueante, `position: fixed` en el top layer, paneles anclados que se salen por abajo, y
pantallas sin camino. Léela antes de escribir un guard, una redirección o un panel flotante.
