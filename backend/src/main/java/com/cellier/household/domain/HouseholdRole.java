package com.cellier.household.domain;

/**
 * Rol de un usuario dentro de un hogar. Se persiste como texto, no como ordinal: el orden de
 * las constantes no debe poder cambiar el significado de las filas ya escritas.
 */
public enum HouseholdRole {

    /** Administra el hogar: renombrarlo, borrarlo, regenerar el código y gobernar la membresía. */
    ADMIN,

    /** Usa el hogar. Puede consultarlo y salirse de él, pero no administrarlo. */
    MEMBER
}
