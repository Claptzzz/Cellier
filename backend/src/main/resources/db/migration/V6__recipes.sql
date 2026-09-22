-- V6__recipes.sql
-- Recetas: qué se necesita y cómo se hace.
--
-- Una receta es dos cosas a la vez: una lista de ingredientes con cantidad —de la misma
-- forma que una plantilla, pero con el producto opcional o no— y una secuencia de pasos de
-- texto. De cruzar los ingredientes contra la despensa sale si la receta está lista para
-- cocinarse ahora mismo, igual que el reporte de compras cruza una plantilla.

CREATE TABLE recipes (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid        NOT NULL,
    name         text        NOT NULL,
    description  text,
    servings     int,
    prep_minutes int,
    created_by   uuid,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fk_recipes_household FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,

    -- Igual que en pantry_templates: quien la creó es un dato, no una autoridad. Cualquier
    -- miembro del hogar edita y borra cualquier receta.
    CONSTRAINT fk_recipes_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,

    CONSTRAINT ck_recipes_name CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    CONSTRAINT ck_recipes_description CHECK (description IS NULL OR length(description) <= 2000),

    -- Las tres son opcionales, así que null y "no se sabe" son el mismo estado: la receta se
    -- puede crear sin ellas y completarse después. Cuando llegan, tienen que tener sentido.
    CONSTRAINT ck_recipes_servings CHECK (servings IS NULL OR servings > 0),
    CONSTRAINT ck_recipes_prep_minutes CHECK (prep_minutes IS NULL OR prep_minutes > 0),

    -- Clave candidata redundante, para que recipe_ingredients pueda referenciar el par y no
    -- sólo el id. Ver la nota del final.
    CONSTRAINT uq_recipes_id_household UNIQUE (id, household_id)
);

CREATE INDEX idx_recipes_household ON recipes (household_id);

-- A propósito, NO hay un índice único de nombre por hogar como en pantry_templates. Dos
-- recetas de "Tarta de manzana" son dos variantes legítimas de un recetario, mientras que dos
-- plantillas con el mismo nombre sólo confundirían cuál abrir en una lista de listas de la
-- compra. No es un olvido.

CREATE TABLE recipe_ingredients (
    id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

    -- La columna que hace falta para que las dos claves foráneas de abajo se puedan atar al
    -- par (id, household_id) en vez de sólo al id. Misma razón que template_items: ver la
    -- nota del final.
    household_id     uuid          NOT NULL,

    recipe_id        uuid          NOT NULL,
    product_id       uuid          NOT NULL,
    quantity         numeric(12,3) NOT NULL,

    -- Un ingrediente opcional no cuenta para decidir si la receta está lista: "sal al gusto"
    -- no puede dejar toda una receta en falta porque el bote está vacío.
    optional         boolean       NOT NULL DEFAULT false,

    CONSTRAINT fk_recipe_ingredients_recipe FOREIGN KEY (recipe_id, household_id)
        REFERENCES recipes (id, household_id) ON DELETE CASCADE,

    CONSTRAINT fk_recipe_ingredients_product FOREIGN KEY (product_id, household_id)
        REFERENCES products (id, household_id) ON DELETE RESTRICT,

    -- Querer "cero" de un ingrediente no es quererlo: es no tener la línea.
    CONSTRAINT ck_recipe_ingredients_quantity CHECK (quantity > 0),

    -- El mismo producto dos veces en la misma receta son dos líneas sobre lo mismo, y la
    -- comprobación de disponibilidad tendría que decidir cuál cuenta.
    CONSTRAINT uq_recipe_ingredients_recipe_product UNIQUE (recipe_id, product_id)
);

CREATE INDEX idx_recipe_ingredients_recipe ON recipe_ingredients (recipe_id);
CREATE INDEX idx_recipe_ingredients_product ON recipe_ingredients (product_id);

CREATE TABLE recipe_steps (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Sin household_id propio, y a propósito: al revés que recipe_ingredients, esta tabla
    -- sólo referencia UNA tabla de hogar (recipes), no dos. No hay dos claves foráneas que
    -- puedan discrepar entre sí, así que no hay nada que una columna redundante pudiera
    -- atar. Es el mismo caso que stock_movements con pantry_items en reglas-esquema.md: el
    -- hogar se hereda de la receta y no se duplica para poder atarlo, porque no hace falta
    -- atarlo a nada más.
    recipe_id    uuid NOT NULL,

    position     int  NOT NULL,
    instruction  text NOT NULL,

    CONSTRAINT fk_recipe_steps_recipe FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE,

    CONSTRAINT ck_recipe_steps_position CHECK (position > 0),
    CONSTRAINT ck_recipe_steps_instruction CHECK (length(btrim(instruction)) BETWEEN 1 AND 1000),

    -- Dos pasos con la misma posición en la misma receta no tendrían un orden que mostrar.
    CONSTRAINT uq_recipe_steps_recipe_position UNIQUE (recipe_id, position)
);

CREATE INDEX idx_recipe_steps_recipe ON recipe_steps (recipe_id);

-- ---------------------------------------------------------------------------------------
-- Por qué recipe_ingredients lleva household_id (y recipe_steps no)
-- ---------------------------------------------------------------------------------------
-- recipe_ingredients referencia DOS tablas de hogar: recipes y products. Sin su propio
-- household_id, las claves foráneas sólo podrían apuntar a los id, y nada en la base
-- impediría una fila cuya receta es del hogar A y cuyo producto es del hogar B. Esa fila
-- haría que la comprobación de disponibilidad de A buscara un producto que en ese hogar no
-- existe, y lo contaría como "falta todo" sin que nada fallara visiblemente.
--
-- recipe_steps sólo referencia recipes. No hay una segunda tabla de hogar con la que su
-- household_id pudiera discrepar, así que duplicarlo no cerraría ningún hueco: sólo repetiría
-- un dato que ya se puede leer siguiendo recipe_id. Regla completa en docs/reglas-esquema.md.
