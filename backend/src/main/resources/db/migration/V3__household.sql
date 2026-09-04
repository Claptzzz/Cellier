-- V3__household.sql
-- Hogares: la unidad de agrupación de todo el resto del dominio (despensa, catálogo,
-- plantillas, recetas). La membresía en un hogar es el núcleo de autorización del sistema:
-- ningún dato del dominio se lee ni se escribe sin una fila en `household_members` que
-- vincule al usuario autenticado con el hogar.
--
-- Se declara aquí el esquema completo del módulo, incluidas las solicitudes de ingreso,
-- aunque los endpoints que las manejan lleguen en un cambio posterior. Encadenar migraciones
-- dependientes entre sí para acompañar el ritmo de los endpoints no aporta nada: Hibernate
-- valida las tablas que tienen entidad y no se queja de las que aún no la tienen.

CREATE TABLE households (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text        NOT NULL,
    join_code  varchar(8)  NOT NULL,
    created_by uuid        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_households_join_code UNIQUE (join_code),
    CONSTRAINT fk_households_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT ck_households_name CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    -- El alfabeto del código de ingreso, replicado como restricción: la base rechaza un
    -- código con caracteres ambiguos aunque el generador de la aplicación se estropee.
    CONSTRAINT ck_households_join_code CHECK (join_code ~ '^[A-HJKMNP-Z2-9]{8}$')
);

CREATE TABLE household_members (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid        NOT NULL,
    user_id      uuid        NOT NULL,
    role         text        NOT NULL,
    joined_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fk_household_members_household FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
    CONSTRAINT fk_household_members_user      FOREIGN KEY (user_id)      REFERENCES users (id),
    CONSTRAINT uq_household_members           UNIQUE (household_id, user_id),
    CONSTRAINT ck_household_members_role      CHECK (role IN ('ADMIN', 'MEMBER'))
);

-- uq_household_members ya crea un índice con household_id de prefijo, que sirve para listar
-- los miembros de un hogar. La consulta inversa —los hogares de un usuario— ataca por
-- user_id, que en ese índice va en segunda posición y no se puede usar como punto de partida.
CREATE INDEX idx_household_members_user_id ON household_members (user_id);

CREATE TABLE join_requests (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid        NOT NULL,
    user_id      uuid        NOT NULL,
    status       text        NOT NULL,
    requested_at timestamptz NOT NULL DEFAULT now(),
    resolved_at  timestamptz,
    resolved_by  uuid,

    CONSTRAINT fk_join_requests_household   FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
    CONSTRAINT fk_join_requests_user        FOREIGN KEY (user_id)      REFERENCES users (id),
    CONSTRAINT fk_join_requests_resolved_by FOREIGN KEY (resolved_by)  REFERENCES users (id),
    CONSTRAINT ck_join_requests_status      CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    -- Sin esta restricción el esquema admitiría filas que ningún caso de uso produce: una
    -- solicitud APPROVED sin constancia de quién ni cuándo la aprobó, o una PENDING que ya
    -- dice estar resuelta. El estado y su resolución son un solo hecho y viajan juntos.
    CONSTRAINT ck_join_requests_resolution CHECK (
        (status =  'PENDING' AND resolved_at IS     NULL AND resolved_by IS     NULL) OR
        (status <> 'PENDING' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
    )
);

-- Un usuario no puede tener dos solicitudes vivas para el mismo hogar. El índice es parcial
-- a propósito: solo restringe las PENDING, de modo que a quien le rechazaron la solicitud, o
-- la canceló, puede volver a pedir sin que el historial se lo impida.
CREATE UNIQUE INDEX uq_join_requests_pending
    ON join_requests (household_id, user_id)
    WHERE status = 'PENDING';

-- "Mis solicitudes", ordenadas por fecha.
CREATE INDEX idx_join_requests_user_id ON join_requests (user_id, requested_at DESC);

-- La bandeja del administrador: las solicitudes de un hogar filtradas por estado.
CREATE INDEX idx_join_requests_household_status ON join_requests (household_id, status);

COMMENT ON COLUMN households.join_code IS
    'Código de 8 caracteres para solicitar el ingreso. Conocerlo NO da acceso: abre una solicitud que un administrador debe aprobar.';
COMMENT ON COLUMN households.created_by IS
    'Quién creó el hogar. Es procedencia histórica, no una fuente de permisos: el creador puede dejar de ser miembro. La autorización se resuelve SIEMPRE contra household_members.';
COMMENT ON COLUMN household_members.role IS
    'ADMIN o MEMBER. Un hogar mantiene siempre al menos un ADMIN: no se puede degradar, expulsar ni dejar salir al último.';
COMMENT ON COLUMN join_requests.resolved_by IS
    'Quién cerró la solicitud: el administrador que la aprobó o rechazó, o el propio solicitante si la canceló.';

-- Las claves foráneas hacia `users` no llevan ON DELETE CASCADE, al contrario que las que
-- apuntan a `households`. Es deliberado: los usuarios se dan de baja de forma lógica
-- (users.deleted_at), nunca se borran de la tabla, así que la cascada no tendría ocasión de
-- ejecutarse. Dejarlas en RESTRICT convierte cualquier intento de borrado físico en un error
-- inmediato en vez de en la desaparición silenciosa del historial de un hogar ajeno.
