# ADR 019 — Flyway gobierna el esquema; Hibernate sólo valida

- **Estado:** aceptada
- **Fecha:** 2026-10-01
- **Ámbito:** `spring.jpa.hibernate.ddl-auto` (`application.yml`), `backend/src/main/resources/db/migration`

## Contexto

Hibernate puede generar y alterar el esquema de base de datos a partir de las entidades JPA
(`ddl-auto: update` o `create`), o se puede dejar el esquema enteramente en manos de
migraciones versionadas con Flyway. Cellier usa ambas herramientas a la vez — JPA para mapear
entidades, Flyway para las migraciones (`V1__baseline.sql` … `V6__recipes.sql`) — así que hace
falta decidir cuál manda cuando una entidad y el esquema no coinciden.

## Decisión

`spring.jpa.hibernate.ddl-auto: validate` en los tres perfiles (`dev`, `test`, `prod`).
Hibernate **nunca** crea ni altera tablas: al arrancar, compara cada entidad contra el esquema
que ya existe y falla de inmediato si no coinciden. El único camino para cambiar el esquema es
una migración nueva de Flyway.

## Consecuencias

1. **El esquema tiene una sola fuente de verdad, escrita a mano y versionada**: los archivos
   `V*__*.sql`. Las restricciones que Hibernate no modelaría por sí solo — los `CHECK` de
   dominio (`ck_pantry_items_quantity`, `ck_households_join_code`), las claves foráneas
   compuestas hacia `(id, household_id)` que impiden la fuga entre hogares (ver
   `docs/reglas-esquema.md`), los índices parciales como `uq_join_requests_pending` — se
   declaran explícitamente en SQL, no se infieren de anotaciones.
2. **Una entidad JPA que no coincide con el esquema falla al arrancar, no en producción silente
   a mitad de una escritura.** `validate` convierte un desajuste en un error de arranque
   inmediato y legible, en vez de en una columna que Hibernate decide alterar por su cuenta.
3. **Toda migración ya aplicada es inmutable.** Corregir un error de una migración pasada
   exige una migración nueva que lo arregle, nunca editar el archivo ya versionado: Flyway
   detecta el checksum cambiado y se niega a continuar.
4. **Añadir o cambiar una columna es siempre un paso manual en dos lugares** (la migración SQL
   y la entidad JPA), nunca uno automático. Es más escritura que `update`, a cambio de que el
   esquema nunca diverja de lo que el equipo escribió a propósito.
