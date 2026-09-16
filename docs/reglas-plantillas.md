# Reglas de las plantillas y del reporte

- **Ámbito:** `template/`, y la frontera con `pantry/`
- **Actualizado:** 2026-09-14

---

## P1 · El reporte se calcula, no se guarda

`faltante = max(0, deseado − disponible)`, al vuelo, cada vez.

Una lista de la compra almacenada empieza a mentir en cuanto alguien abre la nevera. Guardarla
obligaría a decidir cuándo recalcularla, qué hacer con la anterior y cuál manda si discrepan;
tres problemas nuevos para conservar un número que se obtiene con una resta.

El reporte declara su `generatedAt` y es cierto **para ese instante**. No pretende serlo
después, y por eso no hay nada que invalidar.

**Un producto que la plantilla quiere y que no está en la despensa cuenta como cero, no
desaparece.** No tenerlo registrado y tenerlo a cero llevan a la misma compra. Por eso el
cruce es un `LEFT JOIN`: con un join normal, lo que falta del todo sería justo lo que no
aparece en la lista de lo que falta.

**El faltante nunca es negativo.** Tener de más no es tener que devolver, y un número negativo
en una lista de la compra no le dice a nadie qué hacer.

---

## P2 · `parLevel` y `desiredQuantity` son dos preguntas, y ninguna se deriva de la otra

Esta es la regla que evita la contradicción más visible que puede tener el producto: **una
banda de nivel al 80% junto a un reporte que pide seis huevos.**

| | Pregunta que responde | Dónde vive | Alcance |
| --- | --- | --- | --- |
| `pantry_items.par_level` | ¿Voy bien de esto, **siempre**? | La despensa | Un artículo, permanente |
| `template_items.desired_quantity` | ¿Cuánto quiere **esta lista**? | Una plantilla | Una línea de una lista concreta |

### Por qué no se unifican

La tentación es hacer que uno derive del otro. No se puede, y el motivo es una decisión ya
tomada: **un hogar puede tener varias plantillas.** «Compra semanal» quiere 10 huevos y «Asado
del domingo» quiere 24. Entonces:

- Si `par_level` fuera `MAX(desired_quantity)`, la banda mediría contra 24 todo el año y diría
  que la casa anda escasa de huevos cada día que no hay asado.
- Si fuera el de «una plantilla concreta», habría que elegir cuál, y la banda cambiaría de
  significado según qué lista miró el usuario por última vez.
- Si `desired_quantity` fuera `par_level`, las plantillas dejarían de poder querer cantidades
  distintas, que es justamente para lo que existen varias.

No hay derivación que sobreviva a varias plantillas. **Son dos números porque son dos
preguntas.**

### Lo que sí se garantiza por construcción

1. **El reporte no lee `par_level`.** La consulta del cruce no menciona esa columna. No es un
   acuerdo: es que el dato no entra en el cálculo.
2. **La API no llama igual a dos cosas distintas.** El reporte emite `desiredQuantity` y nunca
   `parLevel`; la despensa emite `parLevel` y nunca `desiredQuantity`. Ningún cliente puede
   confundirlas por el nombre.
3. **El numerador sí es el mismo.** `availableQuantity` del reporte y `quantity` de la despensa
   salen de la misma fila de `pantry_items`. Las dos pantallas nunca discrepan sobre **lo que
   hay**; sólo miden contra listones distintos, y cada uno dice cuál es el suyo.

Un test fija la divergencia como comportamiento **deseado**: un artículo con `par_level` 12 y
una plantilla que quiere 10 produce un reporte que dice 10. Está ahí para que nadie lo
«arregle» más adelante derivando un número del otro.

---

## P2b · La pantalla del reporte NO dibuja la banda de nivel

Regla de interfaz, y no una recomendación: **`ui-level-band` no aparece en la pantalla del
reporte de compras.**

La banda codifica una proporción respecto de `par_level`. En una lista de la compra el
denominador es `desiredQuantity`, que es otro número y responde otra pregunta (P2). Dibujarla
ahí pone las dos respuestas juntas e invita a leerlas como una sola: es exactamente la
contradicción que P2 existe para evitar, reintroducida por la puerta de atrás.

**Se escribe aquí porque la tentación es real.** Quien construya esa pantalla tendrá el
componente a mano, ya montado y probado, con la forma exacta de una fila de lista. Reutilizarlo
parecerá obvio y nadie va a recordar por qué no.

Lo que sí puede dibujar el reporte, con lo que ya le da la API:

- `missingQuantity` y `desiredQuantity` como cifras, que es lo que se lleva al súper.
- `status`, que ya distingue lo que falta de lo cubierto sin necesidad de una proporción.
- Si hiciera falta una barra, sería **contra `desiredQuantity`** y tendría que llamarse y
  verse distinta de la banda de nivel. Antes de eso, conviene preguntarse qué decisión toma
  quien la mira: en un pasillo de supermercado, «faltan 6» es más accionable que «40%».

---

## P3 · El orden del reporte es el del supermercado

Faltantes primero; dentro de cada grupo, por categoría; dentro de cada categoría, por nombre.

Los dos primeros criterios son de producto: se compra lo que falta, y se recorre el súper por
secciones. **El tercero es de corrección**: sin él, dos productos de la misma categoría salen
en el orden que quiera el plan de ejecución, y la lista se reordena sola al recargar. Una
lista de la compra que cambia de orden entre dos miradas es una lista en la que se pierde el
sitio.

El orden lo pone la base de datos, en la misma consulta. Ordenar después en memoria obligaría
a traerlo todo para reordenarlo, y ya está traído en el orden bueno.

Esto se comprobó escribiendo la versión ingenua del reporte —recorrer los ítems preguntando a
la despensa uno por uno— para ver qué tests se caían. Se cayeron **tres**: el del coste, que
pasó de 5 sentencias a 19, y los **dos del orden**. La consulta única no es sólo más barata:
es de donde sale el orden. Esa comprobación es la que hace que el test del coste signifique
algo, en vez de ser un número escrito a mano.

---

## P4 · Una plantilla vacía vale cero, no uno

`completionRate` de una plantilla sin líneas es `0.00`.

Matemáticamente sería defendible decir que un conjunto vacío está cubierto al 100%. En pantalla
no lo es: quien lee «100% cubierto» entiende que ya tiene todo lo que quería tener, cuando lo
cierto es que todavía no ha dicho qué quiere. El cero es lo que invita a llenarla.

El resumen entero va a cero —`totalItems`, `missingItems`, `completionRate`— y no revienta.

---

## P5 · La pantalla del reporte se usa en un pasillo

Tres decisiones que salen de mirar dónde se lee, no de qué datos hay.

**Lo marcado no se guarda ni viaja.** Las casillas son para no perder el sitio mientras se
recorre el súper. Persistirlas obligaría a decidir cuándo se limpian, qué pasa si otro miembro
marca lo mismo, y qué significa una lista medio marcada tres días después. Es una ayuda de un
rato, y se va con la pantalla.

**Las acciones sólo aparecen si hay algo que comprar.** Copiar, compartir e imprimir existen
para llevarse la lista; sin faltantes no hay lista que llevar. Y `navigator.share` sólo se
ofrece si el navegador la tiene: un botón que a veces no hace nada es la versión pequeña de un
control muerto.

**El texto plano se agrupa igual que la pantalla.** Quien lo pega en un mensaje lo va a leer
en el mismo pasillo; un volcado sin agrupar obliga a recorrerlo dos veces.

### La hoja de impresión

Lo que se quita del papel, y por qué:

| Fuera | Motivo |
| --- | --- |
| Navegación, barra lateral, cabecera del chasis | El papel no navega |
| Botones de acción | No se pulsan en papel |
| La barra de completitud | Es un fondo de color: sale gris, gasta tinta, y la línea de debajo ya lo dice con palabras |
| «Ya tienes N productos» | La hoja se lleva al súper; ahí sólo importa lo que falta |

Lo que se queda: el nombre de la plantilla, cuántos faltan, la lista agrupada por categoría con
su cifra, y una casilla dibujada como un cuadro para marcar a lápiz.

**El chasis marca su propio cromo con `data-print="hide"`**, en vez de que la hoja global liste
etiquetas. La primera versión ocultaba todo `<header>` y se llevó por delante el encabezado de
la propia página: la hoja salía **sin título**, sin decir de qué lista era. Se vio en la
captura de impresión, que por eso existe.

