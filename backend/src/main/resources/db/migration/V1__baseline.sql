-- V1__baseline.sql
-- Migración base de Cellier.
--
-- Solo habilita las extensiones que necesita el esquema. Las tablas del dominio
-- (identity, household, catalog, pantry, template, recipe) llegan en migraciones
-- posteriores; esta migración se deja intencionalmente vacía de DDL de negocio.
--
-- pgcrypto aporta gen_random_uuid(), usado como valor por defecto de las claves
-- primarias UUID del resto del esquema.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
