# ADR 011 — Un vencimiento por producto, no por lote

- **Estado:** aceptada
- **Fecha:** 2026-09-07
- **Ámbito:** `pantry_items.expires_at` (migración `V4__pantry.sql`, Incremento 5)

## Contexto

La despensa guarda **una fila por producto y hogar** (`uq_pantry_items_household_product`).
De ahí se sigue que `expires_at` es una sola fecha para todo lo que hay de ese producto.

En una casa real eso no siempre es cierto. Dos cartones de huevos comprados con una semana de
diferencia vencen en días distintos, y el modelo sólo puede guardar uno de los dos. Al
reponer, la fecha que quede escrita será la del lote nuevo o la del viejo, pero no las dos.

## Decisión

**Se acepta la limitación.** `expires_at` representa *el vencimiento más próximo* de lo que
hay, y es responsabilidad de quien repone mantenerlo así. No se modelan lotes.

## Qué se pierde exactamente

1. **La fecha deja de ser exacta tras una reposición parcial.** Si quedaban 6 huevos que
   vencen el día 10 y se añaden 12 que vencen el día 24, el modelo guarda una sola fecha.
   Dejar la más próxima (día 10) es lo correcto para avisar, pero sigue marcando «por vencer»
   cuando ya sólo quedan los del día 24 si nadie corrige la fecha al consumir.
2. **No se puede responder «cuánto vence antes del viernes».** Sólo «qué productos tienen su
   lote más próximo antes del viernes», que no es la misma pregunta cuando hay cantidades
   mezcladas.
3. **No hay FIFO.** Consumir resta de un total; el sistema no sabe de qué lote sale.

## Por qué, aun así

Representar lotes exige una tabla aparte con cantidad y fecha por lote, lógica FIFO al
consumir, y una decisión en cada reposición sobre si crea lote nuevo o engorda uno existente.
Pero el coste grande no es ese: es que **«¿cuánto hay?» deja de ser una columna y pasa a ser
una suma**. Esa pregunta la hacen el reporte de compras, la disponibilidad de recetas y la
pantalla de despensa, o sea casi todo el sistema, y todos ellos pasarían a depender de una
agregación en vez de de un valor.

Para un hogar, la función que cumple el vencimiento es **avisar de que hay algo por vencer**,
y para eso «lo más antiguo vence tal día» basta. La precisión que se gana modelando lotes no
cambia lo que la persona hace con esa información: mirar la nevera.

Es coherente con la restricción hermana —una unidad canónica por producto, sin conversión—:
las dos cambian precisión por que comparar sea una resta.

## Qué costaría añadirlo después

Es **aditivo**, y por eso se puede posponer sin deuda estructural:

1. Tabla `pantry_batches (id, pantry_item_id, quantity, expires_at)`.
2. Migrar cada fila actual a un lote único con su cantidad y su fecha.
3. `pantry_items.quantity` pasa a ser un total derivado —columna mantenida o vista— y
   `expires_at` se calcula como el mínimo de los lotes.
4. Consumir aplica FIFO sobre los lotes en vez de restar de un número.

Lo que **no** cambia: la API de cantidades, porque `quantity` sigue existiendo y significando
lo mismo. Lo que sí cambia: el coste de cada lectura y los invariantes de
`ck_pantry_items_quantity`, que pasarían a ser sobre la suma.

## Consecuencia para el Incremento 7

Cuando llegue el reporte de compras, **esta decisión ya está tomada**: no se descubre al
tropezar con ella. Si entonces se decide modelar lotes, el trabajo es el de la lista de
arriba y hay que presupuestarlo como migración de datos, no como campo nuevo.
