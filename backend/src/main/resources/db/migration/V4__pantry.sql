-- V4__pantry.sql
-- Catálogo de productos y despensa del hogar.
--
-- La decisión que gobierna todo el módulo: cada producto define UNA unidad canónica, y
-- todas las cantidades del sistema —despensa, plantillas, recetas— usan esa unidad. No hay
-- conversión. Comparar lo que hay con lo que hace falta es una resta, no una tabla de
-- factores con sus errores de redondeo y sus casos imposibles (¿cuántos gramos son dos
-- lechugas?). La unidad es parte de la identidad del producto, no un atributo suyo.

CREATE TABLE products (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid        NOT NULL,
    name         text        NOT NULL,
    unit         text        NOT NULL,
    category     text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fk_products_household FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
    CONSTRAINT ck_products_unit CHECK (unit IN ('UNIT', 'G', 'KG', 'ML', 'L', 'PACK')),
    CONSTRAINT ck_products_name CHECK (length(btrim(name)) BETWEEN 1 AND 120),

    -- Clave candidata redundante. Existe para que otras tablas puedan referenciar el par
    -- (id, household_id) y no sólo el id: ver la nota sobre claves foráneas compuestas al
    -- final de este archivo.
    CONSTRAINT uq_products_id_household UNIQUE (id, household_id)
);

-- "Leche" y "leche" son el mismo producto. El índice es funcional porque la unicidad es
-- sobre el nombre normalizado, mientras que la columna conserva lo que escribió la persona.
CREATE UNIQUE INDEX uq_products_household_name ON products (household_id, lower(name));

CREATE TABLE pantry_items (
    id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid          NOT NULL,
    product_id   uuid          NOT NULL,
    quantity     numeric(12,3) NOT NULL,
    expires_at   date,

    -- Nivel objetivo del producto en esta casa. Lo consume la banda de nivel, que codifica
    -- cuánto queda RESPECTO DE un objetivo: sin él no hay proporción que dibujar, sólo una
    -- cifra absoluta. Nullable: un artículo sin objetivo dibuja la banda en estado neutro.
    par_level    numeric(12,3),

    -- Dónde se guarda. Texto con CHECK y no un enum de PostgreSQL: añadir un valor a un
    -- enum exige ALTER TYPE, que no es transaccional en todas las versiones y complica los
    -- rollbacks de Flyway.
    storage_location text,

    -- Bloqueo optimista. Dos personas ajustando el mismo producto a la vez es el caso
    -- normal en una casa, no una rareza: quien pierde tiene que enterarse, no sobrescribir.
    version      bigint        NOT NULL DEFAULT 0,
    updated_at   timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT fk_pantry_items_household FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
    CONSTRAINT uq_pantry_items_household_product UNIQUE (household_id, product_id),
    CONSTRAINT ck_pantry_items_quantity CHECK (quantity >= 0),
    CONSTRAINT ck_pantry_items_par_level CHECK (par_level IS NULL OR par_level > 0),
    CONSTRAINT ck_pantry_items_storage_location
        CHECK (storage_location IS NULL OR storage_location IN ('PANTRY', 'FRIDGE', 'FREEZER', 'OTHER')),

    -- La clave foránea va al PAR (producto, hogar), no sólo al producto. Así la base impide
    -- que la despensa de un hogar apunte a un producto de otro: la fila cruzada no se puede
    -- escribir ni con SQL directo. Ver la nota del final.
    CONSTRAINT fk_pantry_items_product FOREIGN KEY (product_id, household_id)
        REFERENCES products (id, household_id) ON DELETE RESTRICT
);

-- El listado de la despensa filtra y ordena por hogar; la unicidad ya cubre ese prefijo,
-- pero el orden por vencimiento necesita su propio índice para no ordenar en memoria.
CREATE INDEX idx_pantry_items_expires_at ON pantry_items (household_id, expires_at);

CREATE TABLE stock_movements (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    pantry_item_id uuid         NOT NULL,
    type          text          NOT NULL,
    delta         numeric(12,3) NOT NULL,
    performed_by  uuid,
    performed_at  timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT fk_stock_movements_item FOREIGN KEY (pantry_item_id) REFERENCES pantry_items (id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_movements_user FOREIGN KEY (performed_by) REFERENCES users (id),
    CONSTRAINT ck_stock_movements_type CHECK (type IN ('PURCHASE', 'CONSUMPTION', 'ADJUSTMENT')),

    -- El tipo y el signo son el mismo hecho contado dos veces, así que no pueden
    -- contradecirse: un CONSUMPTION que suma o un PURCHASE que resta serían filas que
    -- ningún caso de uso produce. Y un movimiento de cero no es un movimiento: cuando un
    -- ajuste no cambia nada, no se escribe fila.
    CONSTRAINT ck_stock_movements_sign CHECK (
        (type = 'CONSUMPTION' AND delta < 0) OR
        (type = 'PURCHASE'    AND delta > 0) OR
        (type = 'ADJUSTMENT'  AND delta <> 0)
    )
);

-- El historial de un artículo se lee de lo más reciente a lo más antiguo, y paginado.
CREATE INDEX idx_stock_movements_item ON stock_movements (pantry_item_id, performed_at DESC);

COMMENT ON COLUMN products.unit IS
    'Unidad canónica del producto. NO se convierte: todas las cantidades del sistema se expresan en ella.';
COMMENT ON COLUMN pantry_items.expires_at IS
    'Vencimiento del lote más próximo. Una fila por producto, así que no representa lotes separados: ver ADR 011.';
COMMENT ON COLUMN pantry_items.version IS
    'Bloqueo optimista. Una colisión responde 409, nunca sobrescribe en silencio.';
COMMENT ON COLUMN stock_movements.performed_by IS
    'Quién movió el stock. Nullable porque un movimiento sobrevive a su autor: el historial no se reescribe.';

-- ---------------------------------------------------------------------------------------
-- Claves foráneas compuestas: por qué pantry_items referencia (id, household_id)
-- ---------------------------------------------------------------------------------------
-- Una clave foránea a products(id) deja escribir una fila cuyo household_id sea el de un
-- hogar y cuyo product_id pertenezca a OTRO. La base no tendría nada que objetar, y esa
-- fila es exactamente la fuga entre hogares que el resto del sistema —el 404 del guardia,
-- la validación de membresía de cada endpoint— existe para impedir.
--
-- Referenciar el par lo hace imposible por construcción, sin depender de que ningún
-- servicio se acuerde. El precio es el índice único redundante uq_products_id_household.
--
-- REGLA DEL ESQUEMA, no detalle de esta migración: toda tabla que guarde su propio
-- household_id Y referencie products o pantry_items lleva la clave foránea compuesta.
-- Aplica a template_items y recipe_ingredients cuando lleguen.
--
-- Las tablas que NO guardan household_id quedan fuera, y por el mismo razonamiento:
-- stock_movements hereda el hogar de su artículo y no tiene columna propia con la que
-- contradecirlo, así que no hay nada que atar. Duplicar la columna para poder atarla sería
-- crear el problema y luego resolverlo.
--
-- Está escrito en docs/reglas-esquema.md.
