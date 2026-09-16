# ADR 010 — Campos de despensa introducidos desde el diseño del shell

- **Estado:** aceptada
- **Fecha:** 2026-08-25
- **Ámbito:** `pantry_items` (migración `V4__pantry.sql`, Incremento 5)

## Contexto

El diseño del shell definió dos elementos de interfaz que necesitan datos que el modelo no
tiene:

1. **La banda de nivel** necesita saber cuánto queda **respecto de un objetivo**. Con sólo la
   cantidad absoluta no se puede dibujar una proporción: 2 kg de arroz puede ser mucho o poco.
2. **La ubicación** aparece en la segunda línea de la fila móvil, en una columna de la tabla
   de desktop y en un filtro.

El primero se declaró en el plan de diseño. **El segundo no**: entró por un wireframe, sin
señalarse, en el mismo documento que señalaba el primero. Ese es el error de proceso que
motiva esta ADR.

## Decisión

Ambos campos se agregan, de forma aditiva, en la migración de despensa del **Incremento 5**:

```sql
-- V4__pantry.sql (Incremento 5). No ahora.
ALTER TABLE pantry_items
  ADD COLUMN par_level        numeric(12,3),           -- nivel objetivo, nullable
  ADD COLUMN storage_location text;                    -- nullable

ALTER TABLE pantry_items
  ADD CONSTRAINT ck_pantry_items_storage_location
  CHECK (storage_location IN ('PANTRY', 'FRIDGE', 'FREEZER', 'OTHER'));
```

Notas de modelado:

- **`storage_location` es `text` con `CHECK`, no un enum de PostgreSQL.** Añadir un valor a un
  enum requiere `ALTER TYPE`, que no es transaccional en todas las versiones y complica los
  rollbacks de Flyway. Con `CHECK` el cambio es un `ALTER TABLE` normal.
- **Ambos son nullable.** Un artículo sin nivel objetivo dibuja la banda en estado neutro; uno
  sin ubicación no aparece en los filtros por ubicación. Ninguno de los dos bloquea el alta.
- **No duplican ninguna fuente de verdad.** La ubicación es un atributo del artículo en esta
  despensa, no una entidad con identidad propia; si más adelante los hogares quieren definir
  sus propias ubicaciones, será una tabla nueva y una migración nueva, no un rediseño de esta.
- En esta pasada (Incremento 4, shell) ambos campos **sólo existen como datos mock** en
  `/dev/ui`. No hay endpoint, entidad ni migración.

## Numeración de migraciones

El plan de diseño escribió `V3__pantry.sql`, que colisiona: `V3` es household. Dos migraciones
con la misma versión hacen fallar Flyway al arrancar, no en tiempo de revisión.

| Versión | Contenido | Incremento |
|---|---|---|
| `V1__baseline.sql` | pgcrypto | 1 · aplicada |
| `V2__identity.sql` | users, refresh_tokens | 2 · aplicada |
| `V3__household.sql` | households, household_members | 3 |
| `V4__pantry.sql` | pantry_items, con `par_level` y `storage_location` | 5 |
| `V5__templates.sql` | plantillas | 6 |
| `V6__recipes.sql` | recetas | 7 |

## Consecuencia de proceso

**Si un wireframe necesita un dato que el backend no tiene, se declara en el plan.** No se
introduce esquema desde un mockup. Un campo que aparece dibujado se lee como un campo que ya
existe, y para cuando alguien lo descubre ya hay componentes construidos encima.

La comprobación es mecánica y va antes de cerrar cualquier plan de diseño: recorrer cada
etiqueta, columna y filtro del wireframe y confirmar que existe una columna o un endpoint que
lo alimenta. Lo que no exista, se lista como dependencia con su migración y su incremento.
