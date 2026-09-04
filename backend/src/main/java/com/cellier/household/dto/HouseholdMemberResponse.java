package com.cellier.household.dto;

import com.cellier.household.domain.HouseholdRole;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.UUID;

/**
 * Una persona del hogar, tal como la ven sus compañeros de hogar.
 *
 * <p>Se identifica por el id del <em>usuario</em>, no por el de la fila de membresía: es el
 * identificador que el cliente ya conoce de su propio perfil y el que viaja en las rutas de
 * {@code /members/{userId}}. La fila de membresía es un detalle de persistencia que no
 * necesita salir a la API.
 */
@Schema(name = "HouseholdMember", description = "Miembro de un hogar, con su rol y su fecha de ingreso.")
public record HouseholdMemberResponse(

        @Schema(description = "Identificador del usuario.", example = "3f1c9a2e-5b7d-4a10-9c88-2f0e6b4d1a73")
        UUID userId,

        @Schema(description = "Nombre para mostrar.", example = "Ana Rivas")
        String displayName,

        @Schema(description = """
                Correo de la persona. Solo lo ven los miembros del hogar, y sirve para
                distinguir a dos homónimos y para reconocer a quien pide entrar.""",
                example = "ana.rivas@gmail.com")
        String email,

        @Schema(description = "URL del avatar, o null si la cuenta no tiene foto.",
                example = "https://lh3.googleusercontent.com/a/ACg8ocK")
        String avatarUrl,

        @Schema(description = "Rol en este hogar.", example = "ADMIN")
        HouseholdRole role,

        @Schema(description = "Fecha en que se incorporó al hogar.", example = "2026-09-03T18:42:11Z")
        Instant joinedAt
) {
}
