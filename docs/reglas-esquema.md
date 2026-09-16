# Reglas del esquema

- **Ámbito:** `backend/src/main/resources/db/migration`
- **Actualizado:** 2026-09-07

Invariantes que valen para **todas** las migraciones, no sólo para la que las introdujo.
Léelas antes de escribir una tabla nueva.

## 1. Clave foránea compuesta con `household_id`

> **Toda tabla que guarde su propio `household_id` y referencie otra tabla de hogar lleva la
> clave foránea al par `(id, household_id)`, no sólo al `id`.**

Una clave foránea a `products(id)` deja escribir una fila cuyo `household_id` es el de un
hogar y cuyo `product_id` pertenece a **otro**. La base no tiene nada que objetar, y esa fila
es exactamente la fuga entre hogares que el resto del sistema existe para impedir: el `404`
del guardia, la validación de membresía de cada endpoint, el `403` reservado a quien sí es
miembro. Todo eso se salta con una fila mal escrita.

Referenciar el par lo hace **imposible por construcción**, sin depender de que ningún
servicio se acuerde y sin que valga escribir SQL directo. Exige una clave candidata
redundante en la tabla referenciada —`UNIQUE (id, household_id)`—, y ese índice es el precio
entero.

Es una garantía más fuerte que las de aplicación y más barata que cualquiera de las
comprobaciones que ya hay en el código.

**Dónde aplica hoy**

| Tabla | Referencia | Clave foránea |
|---|---|---|
| `pantry_items` | `products` | `(product_id, household_id) → products (id, household_id)` |
| `template_items` | `products` | `(product_id, household_id) → products (id, household_id)` |
| `template_items` | `pantry_templates` | `(template_id, household_id) → pantry_templates (id, household_id)` |

**Dónde aplicará**: `recipe_ingredients`, en el Incremento 9. Lleva `household_id` y las dos
claves foráneas compuestas, igual que `template_items`. **No es una pregunta abierta**: está
decidido aquí.

### Las dos claves se sostienen la una a la otra

No son dos protecciones sueltas que casualmente cubren el mismo hueco: juntas cierran el
espacio entero. Comprobado contra la base real, intentando la fila cruzada de las dos maneras
posibles:

```
-- household_id = el de la plantilla → no encaja el producto
ERROR: violates foreign key constraint "fk_template_items_product"
DETAIL: Key (product_id, household_id)=(67af…, 9012…) is not present in table "products".

-- household_id = el del producto → deja de encajar la plantilla
ERROR: violates foreign key constraint "fk_template_items_template"
DETAIL: Key (template_id, household_id)=(a67b…, ef2d…) is not present in table "pantry_templates".
```

**No hay valor de `household_id` que satisfaga a las dos con una plantilla y un producto de
hogares distintos.** Ese es el argumento completo de la regla: no es que cada clave tape su
lado, es que la columna compartida las obliga a coincidir. Con una sola clave compuesta —o
con dos claves simples— el hueco sigue abierto.

### Por qué en `template_items` no bastaba heredar el hogar

El enunciado original del Incremento 7 no traía la columna, y es anterior a esta regla. Lo
que decidió el asunto fue mirar qué pasa cuando la fila cruzada existe:

> Una plantilla del hogar A apunta a un producto del hogar B. El reporte de compras cruza ese
> ítem contra la despensa de A, no encuentra stock, y **pide comprar algo que en ese hogar no
> existe**.

La lista de compras sale mal sin ningún error visible. Eso es peor que una fuga que falla
ruidosamente: no hay nada que investigar porque no hay nada roto, sólo una compra de más.

**Dónde NO aplica, y por el mismo razonamiento**: las tablas que no guardan `household_id`.
`stock_movements` hereda el hogar de su artículo y no tiene columna propia con la que
contradecirlo, así que no hay nada que atar. Duplicar la columna para poder atarla sería
crear el problema y luego resolverlo.

## 2. Un estado y su constancia viajan juntos

Si una fila tiene un estado y columnas que sólo tienen sentido en ciertos estados, un `CHECK`
lo impone. Sin él, el esquema admite filas que ningún caso de uso produce, y esas filas
aparecen tarde, en una consulta que asumía lo contrario.

| Tabla | Restricción | Qué impide |
|---|---|---|
| `join_requests` | `ck_join_requests_resolution` | Una solicitud resuelta sin constancia de quién ni cuándo, o una pendiente que dice estar resuelta |
| `stock_movements` | `ck_stock_movements_sign` | Un `CONSUMPTION` que suma, un `PURCHASE` que resta, o un movimiento de cero |

## 3. El alfabeto y los formatos se replican en la base

Cuando la aplicación genera un valor con una forma concreta, la base la exige también:
`ck_households_join_code` repite el alfabeto sin caracteres ambiguos. No es desconfianza del
código, es que el código cambia y la fila persiste.

## 4. Texto con `CHECK`, no enums de PostgreSQL

Añadir un valor a un enum exige `ALTER TYPE`, que no es transaccional en todas las versiones
y complica los rollbacks de Flyway. Con `text` y un `CHECK`, ampliar el dominio es un
`ALTER TABLE` normal. Aplica a `role`, `status`, `unit`, `type` y `storage_location`.

## 5. Los usuarios no se borran

Las claves foráneas hacia `users` no llevan `ON DELETE CASCADE`: la baja es lógica
(`users.deleted_at`). En `stock_movements`, `performed_by` es además nullable porque un
movimiento sobrevive a su autor: el historial no se reescribe cuando alguien se va.

## 6. Un parámetro comparado con `null` en JPQL no tiene tipo

**El filtro opcional escrito como `(:param is null or …)` no funciona.** Es la trampa que más
veces ha mordido en este proyecto, y siempre con el mismo aspecto: la consulta compila, el
test pasa cuando el filtro llega con valor, y revienta con 500 cuando llega vacío.

```sql
-- NO
where h.id = :householdId
  and (:search is null or lower(p.name) like lower(concat('%', :search, '%')))
```

```
ERROR: function lower(bytea) does not exist
  Hint: No function matches the given name and argument types.
```

**Por qué.** Comparar un parámetro con `null` no le da a Hibernate ninguna pista de su tipo:
no aparece junto a ninguna columna de la que inferirlo. Sin tipo, lo envía como `bytea`, y
PostgreSQL no tiene un `lower(bytea)`. El mensaje no menciona el parámetro ni el `is null`,
así que leerlo no lleva a la causa.

**Cómo se resuelve: dos consultas.**

```java
List<X> findAllOf(UUID householdId);                       // sin filtro
List<X> findMatching(UUID householdId, String search);     // con filtro
```

y el servicio elige. Dos consultas legibles valen más que una con anotaciones de tipado
(`@Param` con `TypedParameterValue`, `CAST(:search AS string)`), que además hay que acertar
por parámetro y se olvidan en el siguiente.

**Dónde está aplicado hoy**

| Repositorio | Filtro opcional |
|---|---|
| `JoinRequestRepository` | `findForHousehold` / `findForHouseholdByStatus` |
| `ProductRepository` | `findAllOf` / `findMatching` |

**Lo que viene** —la despensa filtra por búsqueda **y** por categoría— multiplica las
combinaciones. Cuando pasen de dos, la salida no es volver al `is null`, sino una
especificación (`Specification<T>` de Spring Data), que construye el `where` sin parámetros
fantasma.
