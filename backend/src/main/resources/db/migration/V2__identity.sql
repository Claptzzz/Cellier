-- V2__identity.sql
-- Identidad: usuarios autenticados con Google y refresh tokens propios de Cellier.

-- citext da igualdad sin distinguir mayúsculas para el correo, de modo que
-- "Ana@Gmail.com" y "ana@gmail.com" son el mismo usuario a ojos del índice único.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    google_sub       text        NOT NULL,
    email            citext      NOT NULL,
    display_name     text        NOT NULL,
    avatar_url       text,
    locale           text        NOT NULL DEFAULT 'es-CL',
    theme_preference text        NOT NULL DEFAULT 'SYSTEM',
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,

    CONSTRAINT uq_users_google_sub UNIQUE (google_sub),
    CONSTRAINT uq_users_email      UNIQUE (email),
    CONSTRAINT ck_users_theme_preference CHECK (theme_preference IN ('SYSTEM', 'LIGHT', 'DARK'))
);

-- Los índices sobre google_sub y email los crea PostgreSQL automáticamente al declarar
-- uq_users_google_sub y uq_users_email: una restricción UNIQUE se implementa con un índice
-- btree sobre esas mismas columnas. Añadir índices sueltos encima sería duplicarlos y pagar
-- su mantenimiento en cada escritura sin ganar nada en las lecturas.

CREATE TABLE refresh_tokens (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL,
    token_hash text        NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fk_refresh_tokens_user  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uq_refresh_tokens_hash  UNIQUE (token_hash)
);

-- Se busca por usuario al revocar todas sus sesiones; esa columna no es única, así que
-- este índice sí hace falta.
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id);

-- Barrido de tokens caducados o revocados sin escanear la tabla entera.
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);

COMMENT ON COLUMN users.google_sub IS 'Claim `sub` del ID token de Google: identificador estable e inmutable de la cuenta.';
COMMENT ON COLUMN users.deleted_at IS 'Borrado lógico. Un usuario con deleted_at no nulo no puede autenticarse.';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'SHA-256 en hexadecimal del refresh token. El valor en claro nunca se persiste.';
