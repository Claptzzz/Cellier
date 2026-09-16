# Sistema de diseño de Cellier

Referencia escrita. La referencia visual viva es `/dev/ui`, que sólo existe en desarrollo.

## Tokens

**Once tokens semánticos**, no diez. `--border` se desdobló en dos tras medir los contrastes:
WCAG 1.4.11 sólo exige 3:1 al borde que es el **único indicador** de un control. La hairline
que separa filas puede y debe ser mucho más tenue que el contorno de un `Input`; con un solo
token había que elegir entre una hairline demasiado marcada o un contorno de campo que no
cumple. Son dos trabajos distintos y necesitan dos valores.

| Token | Claro | Oscuro | Contraste sobre `--surface` |
|---|---|---|---|
| `--surface` | `#F3F5F6` | `#10161B` | base |
| `--surface-raised` | `#FBFCFC` | `#182128` | base |
| `--surface-sunken` | `#E4E9EC` | `#0A0F13` | base |
| `--text` | `#16202A` | `#E4EBF0` | 15.07 / 15.13 · AAA |
| `--text-muted` | `#5A6B78` | `#94A6B3` | 5.04 / 7.26 · AA |
| `--border` | `#CFD8DE` | `#26333C` | hairline decorativa |
| `--border-strong` | `#7E888F` | `#617079` | 3.31 / 3.56 · AA no textual |
| `--accent` | `#0A5FBF` | `#6BB0F5` | 5.64 / 7.94 · AA |
| `--accent-contrast` | `#FFFFFF` | `#06121F` | 6.17 / 8.22 sobre `--accent` |
| `--ok` | `#2B7449` | `#5FBE84` | 5.19 / 7.97 · AA |
| `--warn` | `#8A5A00` | `#E0A33A` | 5.42 / 8.22 · AA |
| `--danger` | `#B3372C` | `#F0796B` | 5.49 / 6.64 · AA |

`--ok` se oscureció de `#2F7D4F` a `#2B7449` en revisión: el valor original medía 4.61:1, a
0.11 de incumplir AA. Un token al borde del umbral es un token que fallará en cuanto alguien
lo ponga sobre `--surface-sunken`.

Los tokens `*-weak` (`--accent-weak`, `--ok-weak`, `--warn-weak`, `--danger-weak`) son fondos
de estado, no colores de texto, y por eso no llevan requisito de contraste propio.

## Por qué el acento es azul

Una app de inventario tiene tres colores comprometidos por semántica: verde, ámbar y rojo.
Si el acento de marca cae en esa banda, un botón primario y un badge de estado se confunden
de un vistazo, que es justo el vistazo que la app existe para servir.

El azul elegido es el **azul de utillaje alimentario**: en cocina profesional el azul está
reservado a lo que toca la comida sin ser comida (tablas, guantes, tiritas), porque casi nada
comestible es azul. En Cellier marca la herramienta (acción, foco, estado activo) y nunca el
contenido del inventario.

## Tipografía

| Uso | Familia | Regla |
|---|---|---|
| Display | Bricolage Grotesque Variable | **Sólo ≥20px.** Por debajo sus terminales irregulares se emborronan en vez de aportar carácter |
| Cuerpo | Geist Variable | 15px base |
| Cantidades | Geist Mono Variable | Cifras tabulares. Las cantidades se comparan en columna |

El nombre del hogar en el chip del header va a 15px y por tanto usa **Geist, no Bricolage**.
El plan original decía "Bricolage para el nombre del hogar" y a la vez "Bricolage sólo ≥24px";
era una contradicción. Se resolvió bajando el umbral a 20px (los títulos de pantalla lo
cumplen) y sacando el chip del header del alcance de la display.

### La regla de los 16px

`Input`, `Select` y el campo numérico editable de `QuantityStepper` usan
`--text-control: 16px`, **sin excepción**, aunque el cuerpo de la app sea 15px.

Safari en iOS hace auto-zoom al enfocar cualquier campo con `font-size < 16px` y deja la
página descuadrada, sin volver atrás al salir del campo. La regla está escrita también como
comentario en `styles.scss` para que no se pierda en una futura pasada de consistencia.

### Un campo editable NO lleva separador de miles

Vale para cualquier campo de cantidad que el usuario pueda escribir: el de `QuantityStepper`,
y los que traerán plantillas y recetas.

Lo que se pinta en un campo vuelve a entrar al confirmar, y ahí el separador **cambia de
significado**. En es-CL el punto agrupa miles al escribir y separa decimales al leer:

> El campo muestra `1.500`. El usuario sale sin tocar nada. Se parsea `1.500` → **1,5**.
> 1500 g de arroz se convierten en un gramo y medio, sin que nadie haya escrito nada.

Formatea el valor del campo con `useGrouping: false`. La agrupación se queda para lo que sólo
se lee —la fila de la lista, un resumen, un total—, donde nadie la va a volver a escribir.

La misma trampa, al revés, está en el sentido contrario: al leer hay que aceptar la coma
decimal, que es lo que teclea alguien en es-CL.

### El valor de un control se refleja con un efecto, no con `[value]`

Vale para todo componente de `shared/ui` que envuelva un `<input>`, `<select>` o `<textarea>`.

`[value]="algo()"` sólo escribe el DOM cuando el valor enlazado cambia **entre dos
comprobaciones**. Si el usuario teclea, el elemento ya tiene su texto y Angular anota ese
mismo valor como el último visto; cuando algo de fuera devuelve la señal a lo que ya había
—vaciar un formulario tras enviarlo, corregir una fila tras un conflicto— no hay cambio que
detectar y el campo se queda con lo que el usuario escribió.

Por eso existe `shared/ui/native-value.ts`:

```ts
constructor() {
  mirrorToNative(this.field, this.value);   // this.field es un viewChild del elemento
}
```

Un efecto depende de la señal, no de lo que Angular recuerde, así que reacciona siempre; y
como lee también la referencia al elemento, corre en cuanto la vista existe, lo que arregla de
paso el valor inicial. Escribe **sólo si difiere**, porque asignar el mismo texto mueve el
cursor en algunos navegadores.

**Quien use el ayudante no debe enlazar además `[value]`.** Dos mecanismos escribiendo el
mismo atributo se pisan, y el fallo depende del orden en que corran.

**Por qué es una pieza y no tres arreglos.** El mismo fallo se encontró por separado en
`ui-input` y en `ui-quantity-stepper`, con dos incrementos de diferencia, y al revisar los tres
resultó que `ui-select` nunca había reflejado un cambio externo y nadie lo había mirado. La
comprobación vive en `native-value.spec.ts`, que somete a los tres al mismo maltrato: quitar
la pieza de cualquiera de ellos tira ocho tests.

Y no es sólo cosa de controles: es un caso particular de que **la igualdad decide si algo
ocurre**, que ya ha mordido también a un `computed` usado como disparador. La causa común y
sus tres caras están en la sección 9 de
[frontend-orden-de-ejecucion.md](frontend-orden-de-ejecucion.md).

### Un `<dialog>` modal necesita `margin: auto` escrito a mano

El navegador centra un `<dialog>` abierto con `showModal()` mediante `margin: auto`, y la base
de estilos resetea el margen de todos los elementos. Sin volver a ponerlo, el diálogo se pega
a la esquina superior izquierda. El fondo atenuado sí se pinta, así que parece que funciona.

No se vio hasta el Incremento 6, cuando una captura enseñó por primera vez un `ui-dialog`
abierto: hasta entonces el componente existía y nadie lo había mirado en pantalla. Es la misma
lección que la sección 4 de [frontend-orden-de-ejecucion.md](frontend-orden-de-ejecucion.md),
con otro elemento: **el top layer no hereda lo que uno supone**.

### Un nombre de input puede colisionar con un atributo HTML de presentación

`ui-menu` tiene un input llamado `align`. En plantilla se escribe estáticamente
—`<ui-menu align="end">`—, y **un atributo estático se queda en el DOM** además de alimentar
el input. Ahí está la trampa: `align` es un atributo de presentación heredado del HTML de los
noventa, y el navegador lo traduce a `text-align` para todo el subárbol.

Medido en un elemento desconocido, con todos los atributos legados sospechosos puestos a la
vez y comparando el estilo calculado contra un hermano limpio:

```
align="end"   →  text-align: start -> end
width height bgcolor border color size valign nowrap hspace vspace  →  sin efecto
```

O sea: **de toda la familia, Chromium sólo mapea `align`** sobre un elemento desconocido. Los
demás se quedan en el DOM sin consecuencias. (Medido en Chromium; otros motores podrían
diferir, así que la regla se escribe para la familia entera, no sólo para `align`.)

Llevaba así desde el Incremento 4 y nadie lo vio, porque todo el contenido de los paneles eran
filas flex, donde `text-align` no pinta nada. Salió a la luz el día que el panel ganó un
título, que es un bloque de texto: apareció alineado a la derecha sin que nada en el CSS del
título lo pidiera.

**Inventario de `shared/ui`, revisado en el Incremento 8:**

| Componente | Input | ¿Se escribe estático? | ¿El navegador lo mapea? |
| --- | --- | --- | --- |
| `ui-menu` | `align` | Sí, en 3 sitios | **Sí** → contenido con `text-align: start` en `.ui-menu-panel` |
| `ui-skeleton` | `width`, `height` | Sí, en ~20 sitios | No |
| `ui-button`, `ui-icon`, `ui-icon-button` | `size`, `iconSize` | Sí | No |
| `ui-input` | `type`, `name`, `required`, `placeholder`, `autocomplete`, `spellcheck` | Sí | No son de presentación; sin efecto de maquetación |
| `ui-quantity-stepper` | `min`, `max`, `step`, `value` | Sí | No |

**La regla.** Antes de bautizar un input, comprobar que el nombre no es un atributo HTML de
presentación: `align`, `valign`, `width`, `height`, `bgcolor`, `background`, `border`, `color`,
`size`, `face`, `nowrap`, `hspace`, `vspace`. Si el nombre es el correcto de todas formas
—`width` en un esqueleto lo es—, **el componente neutraliza la propiedad heredada en su propia
raíz**, como hace `.ui-menu-panel` con `text-align: start`. Y hay una salida barata cuando da
igual: pasarlo como binding (`[align]="..."`) no deja atributo en el DOM.

Esta clase de fallo es silenciosa por construcción: no hay error, el input funciona, y el
efecto parásito sólo se nota cuando el contenido cambia de forma. Es pariente de la sección 11
de [frontend-orden-de-ejecucion.md](frontend-orden-de-ejecucion.md) —algo heredado del entorno
que el componente no eligió ni comprobó—.

### Un elemento encima de un input es donde se pierden los clics

El campo de `ui-quantity-stepper` medía 70×24 dentro de un grupo de 48 px de alto: la unidad
compartía la columna y le robaba altura. Pulsar el hueco de arriba o de abajo no enfocaba
nada. Se arregló sacando **la unidad** del flujo, no estirando el campo:

```
.centro   { position: relative }
.unidad   { position: absolute; inset-inline: 0; bottom: 2px; pointer-events: none }
input     { flex: 1 1 auto; align-self: stretch; padding-bottom: 12px }
```

Con el campo solo en el flujo, hereda los 48 px del grupo por el `items-stretch` que ya
estaba. Estirarlo *dentro* de la columna se quedaba en 37, y pasar número y unidad a la misma
línea dejaba el campo en 29 px de ancho al 200 % de zoom. Las cuatro opciones, medidas, están
en `frontend-verificacion.md`.

**`pointer-events: none` en lo que va encima no es opcional.** La unidad cubre el tercio
inferior del campo; sin eso, un tercio de los clics no llegarían al input y el fallo sería
intermitente según dónde pulse cada uno. Comprobado midiendo: clic en el centro, sobre la
propia unidad y en las cuatro esquinas del campo, más `Tab` desde el botón de restar; los seis
dejan el foco en el `<input>`, y teclear y pulsar Enter emite el `PATCH`.

**La regla.** Si algo se coloca encima de un control, lleva `pointer-events: none` y
`aria-hidden` cuando sea decorativo, y se comprueba pulsando en las esquinas, no en el centro.
El centro casi siempre funciona.

## El copy no asume el género de lo que escribe el usuario

Los nombres de hogar, de producto y de receta son **entrada libre**. No se puede deducir su
género, y adivinarlo produce frases que chirrían en cuanto el nombre no es el del ejemplo:

> ~~«Casa Rivas está listo»~~ · ~~«Leche entera fue añadido»~~ · ~~«Tarta de manzana está
> marcada como favorito»~~

**La regla: concuerda siempre con el sustantivo del sistema —hogar, producto, receta,
plantilla— y deja el nombre propio en aposición o como complemento.**

| En vez de | Escribe |
|---|---|
| «{{nombre}} está listo» | «Tu hogar está listo» · «Creaste **{{nombre}}**» |
| «{{producto}} añadido» | «Producto añadido: **{{producto}}**» |
| «{{receta}} guardada» | «Receta guardada: **{{receta}}**» |

Los sustantivos del sistema sí tienen género conocido y fijo, así que la frase es correcta
sea cual sea el nombre que entre. El nombre propio, además, se lee mejor destacado que
disuelto en la oración.

Esto aplica igual a los textos de confirmación destructiva, que **sí** deben nombrar a la
persona o la cosa concreta: «Expulsar a Camila del hogar» funciona porque el verbo no
concuerda con el nombre. En cuanto haga falta un participio o un adjetivo, el sustantivo del
sistema tiene que aparecer.

## Reglas externas evaluadas y no aplicadas

El Incremento 3 pasó las pantallas por una guía externa de interfaz web (`web-interface-guidelines`,
descargada en el momento de la revisión, así que su contenido puede variar). Casi todo lo que
señaló era correcto y se aplicó: locale, dimensiones de imagen, enlace de salto, jerarquía de
encabezados, `theme-color`, y un `max-w-full` en `Button` que arreglaba un desbordamiento real
al ampliar al 200 %.

Tres reglas se evaluaron y **se decidió no seguirlas**. Se anotan aquí para que nadie las
vuelva a aplicar en una pasada de consistencia creyendo que fue un descuido.

### «Title Case en encabezados y botones (estilo Chicago)»

**No aplica.** Es una convención del inglés. El español usa mayúscula inicial y nada más:
«Crear hogar», no «Crear Hogar». La regla contradice el idioma de la interfaz, no una decisión
de este sistema.

### «Los placeholders terminan en `…`»

**No aplica a los nuestros.** Esa regla apunta a placeholders que describen una acción
(«Buscar…»). Los de Cellier son **valores de ejemplo**: `Casa Rivas`, `K7M2QP9X`. Un ejemplo con
puntos suspensivos se lee como un valor truncado, que es peor que no tenerlos.

El problema de fondo que la regla ataca —el placeholder haciendo de etiqueta— ya está resuelto
por la regla propia: etiqueta arriba, siempre, y el placeholder sólo como ejemplo.

### «El botón de envío permanece habilitado hasta que empieza la petición»

**No se sigue en el campo del código de invitación**, que se deshabilita hasta tener 8
caracteres válidos.

La regla existe para cuando el botón deshabilitado es **la única señal** de que algo falta: ahí
el usuario pulsa, no pasa nada y no sabe por qué. En este campo hay otras dos señales, y
permanentes: la pista de formato bajo la etiqueta y el error en vivo cuando lo escrito no
encaja.

Y hay una diferencia que la regla genérica no contempla: **el código tiene longitud fija y
conocida**. El botón habilitándose justo al llegar al octavo carácter *confirma* que vas bien;
no esconde un problema, lo cierra. Con un campo de longitud variable —un nombre, una
descripción— la regla sí valdría, y entonces habría que seguirla.

## Espaciado, radios, elevación

Espaciado base 4px: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`.

| Radio | Valor | Aplica a |
|---|---|---|
| `--radius-sm` | 6px | Input, Select, Badge, IconButton |
| `--radius-md` | 10px | Button, QuantityStepper, fila de inventario |
| `--radius-lg` | 16px | Card, Dialog, BottomSheet |
| pill | 999px | Sólo chip de hogar y Badge |

Elevación con **modelo de estante**: en una despensa nada flota, todo se apoya. El nivel 1 es
un canto duro de 1px hacia abajo, no una sombra ambiental. En tema oscuro la sombra no se lee,
así que la elevación se expresa subiendo un escalón de superficie y aclarando el borde.

## La banda de nivel

El elemento firma. Banda vertical de 4px en el canto de entrada de cada fila: la **altura
rellena** codifica cuánto queda respecto del nivel objetivo, el **color** codifica el estado,
y el **canal de fondo** (`--surface-sunken`) da la referencia contra la que se lee la
proporción. Sin ese canal, una banda al 30% y una banda simplemente corta se ven igual.

No es una barra de progreso: no hay porcentaje ni relleno de marca. Es un nivel dentro de un
recorrido, como un termómetro.

### Qué canal soporta qué

Medido, no supuesto:

- **El llenado es robusto.** 67 puntos de luminancia entre relleno y canal, así que los cuatro
  niveles se distinguen en escala de grises. Verificado en captura.
- **El color de estado no es robusto por sí solo.** `--ok`, `--warn` y `--danger` tienen
  luminancias casi idénticas (0.2 a 1.0 puntos de separación), así que en escala de grises son
  indistinguibles **entre sí**.

Se probaron una muesca para `warn` y un rayado diagonal para `danger` como segundo canal
dentro de la banda. **Se descartaron tras verlos en captura**: a 4px de ancho no se leen, y
con `danger` el relleno suele rondar el 5%, así que no hay superficie donde dibujar nada.

La redundancia que exige WCAG 1.4.1 la aportan el **texto de la fila** ("vence mañana",
"vencido") y el **Badge**, que acompañan a la banda en todos los contextos donde aparece. La
banda no es la única fuente del estado en ninguna pantalla.

## El Badge, y por qué su color tampoco basta

Una versión anterior de este documento afirmaba que el Badge aportaba el canal redundante
mientras a la vez reconocía que `warn` y `danger` no se distinguen sin color. Las dos cosas
no podían ser ciertas: si el Badge sólo cambiaba de tono, no aportaba nada precisamente en el
par donde importa, "vence pronto" contra "vencido".

Cada tono de estado lleva ahora un icono elegido por **silueta**, no por relleno ni por peso:

| Tono | Icono | Silueta |
|---|---|---|
| `ok` | `check` | trazo abierto, sin contorno |
| `warn` | `warning` | triángulo |
| `danger` | `x-circle` | círculo con aspa |

Triángulo contra círculo es la máxima diferencia de contorno disponible a 14px, y es la
convención de la señalética vial por el mismo motivo. `neutral` y `accent` no llevan icono
porque no son estados: rotulan categorías ("Alacena", "Plantilla").

Verificado en captura, en ambos temas, en escala de grises y con deuteranopía simulada: los
tres estados se separan por forma. El texto de cada estado además difiere, así que hay dos
canales por encima del tono. Las capturas están en `docs/ui-shots/badge-*.png`.
