-- V5__templates.sql
-- Plantillas de despensa: lo que este hogar quiere tener en casa.
--
-- Una plantilla es una lista de deseos con cantidades: «de esto quiero tener diez». No es
-- una compra ni un estado; es el listón contra el que se mide la despensa. De restar una
-- cosa de la otra sale el reporte de compras, que se calcula al vuelo y no se guarda: una
-- lista de la compra guardada empieza a mentir en cuanto alguien abre la nevera.

CREATE TABLE pantry_templates (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid        NOT NULL,
    name         text        NOT NULL,
    created_by   uuid,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fk_pantry_templates_household FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,

    -- Quien la creó se conserva como dato, no como autoridad: cualquier miembro del hogar
    -- puede editarla. Si esa persona se da de baja, la plantilla sigue siendo del hogar y
    -- la autoría queda en nulo. Es la misma regla que en el resto del sistema: `created_by`
    -- nunca decide quién puede hacer qué.
    CONSTRAINT fk_pantry_templates_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,

    CONSTRAINT ck_pantry_templates_name CHECK (length(btrim(name)) BETWEEN 1 AND 80),

    -- Clave candidata redundante, para que template_items pueda referenciar el par y no
    -- sólo el id. Ver la nota del final.
    CONSTRAINT uq_pantry_templates_id_household UNIQUE (id, household_id)
);

-- "Compra semanal" y "compra semanal" son la misma plantilla. Índice funcional por la misma
-- razón que en products: la unicidad es sobre el nombre normalizado y la columna conserva
-- lo que escribió la persona.
CREATE UNIQUE INDEX uq_pantry_templates_household_name
    ON pantry_templates (household_id, lower(name));

CREATE TABLE template_items (
    id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

    -- La columna que el enunciado original no traía, y sin la cual las dos claves foráneas
    -- de abajo no se pueden atar al par. Ver la nota del final: no está aquí por simetría.
    household_id     uuid          NOT NULL,

    template_id      uuid          NOT NULL,
    product_id       uuid          NOT NULL,
    desired_quantity numeric(12,3) NOT NULL,

    CONSTRAINT fk_template_items_template FOREIGN KEY (template_id, household_id)
        REFERENCES pantry_templates (id, household_id) ON DELETE CASCADE,

    CONSTRAINT fk_template_items_product FOREIGN KEY (product_id, household_id)
        REFERENCES products (id, household_id) ON DELETE RESTRICT,

    -- Querer «cero huevos» no es querer nada: es no tener la línea. Un cero convertiría la
    -- plantilla en un sitio donde declarar ausencias, que es justo lo que ya dice el hecho
    -- de no estar en la lista.
    CONSTRAINT ck_template_items_desired CHECK (desired_quantity > 0),

    -- El mismo producto dos veces en la misma plantilla son dos deseos sobre lo mismo, y el
    -- reporte tendría que decidir cuál gana. Se impide.
    CONSTRAINT uq_template_items_template_product UNIQUE (template_id, product_id)
);

-- El reporte recorre los ítems de UNA plantilla y los cruza con la despensa. Los dos índices
-- son los dos lados de ese cruce.
CREATE INDEX idx_template_items_template ON template_items (template_id);
CREATE INDEX idx_template_items_product ON template_items (product_id);

-- ---------------------------------------------------------------------------------------
-- Por qué template_items lleva household_id
-- ---------------------------------------------------------------------------------------
-- Sin esa columna, las claves foráneas sólo pueden apuntar al id, y entonces nada en la base
-- impide una fila cuya plantilla es del hogar A y cuyo producto es del hogar B.
--
-- Lo que hace grave ese caso no es la fuga en sí, sino cómo se manifiesta: el reporte cruza
-- ese ítem contra la despensa de A, no encuentra stock, y pide comprar algo que en ese hogar
-- no existe. La lista de la compra sale mal SIN NINGÚN ERROR VISIBLE. No hay nada que
-- investigar porque no hay nada roto, sólo una compra de más.
--
-- Referenciar los pares lo hace imposible por construcción. El precio es esta columna y la
-- clave candidata redundante de pantry_templates. Regla completa en docs/reglas-esquema.md.
