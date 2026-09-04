package com.cellier.household;

import com.cellier.household.domain.HouseholdMember;
import com.cellier.household.domain.HouseholdRole;
import com.cellier.household.dto.HouseholdMemberResponse;
import com.cellier.household.dto.HouseholdSummaryResponse;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface HouseholdMemberRepository extends JpaRepository<HouseholdMember, UUID> {

    /**
     * La consulta sobre la que se apoya toda la autorización del sistema. Devuelve vacío
     * tanto si el hogar no existe como si el usuario no pertenece a él, que es exactamente
     * lo que la API necesita para no distinguir ambos casos.
     */
    Optional<HouseholdMember> findByHouseholdIdAndUserId(UUID householdId, UUID userId);

    long countByHouseholdId(UUID householdId);

    /**
     * Cuántas personas del hogar tienen ese rol. Con {@code ADMIN} es la comprobación de R4:
     * si vale 1, ese administrador es el último y no se le puede degradar, expulsar ni dejar
     * salir. Debe leerse con la fila del hogar ya bloqueada.
     */
    long countByHouseholdIdAndRole(UUID householdId, HouseholdRole role);

    /**
     * Las personas de un hogar, con sus datos de perfil, en una sola consulta.
     *
     * <p>Orden: primero los administradores, y dentro de cada grupo por antigüedad. Es el
     * orden en que se lee una lista de miembros —quién manda, y desde cuándo está cada uno—,
     * y el desempate por identificador lo hace reproducible entre llamadas.
     */
    @Query("""
            select new com.cellier.household.dto.HouseholdMemberResponse(
                       u.id,
                       u.displayName,
                       u.email,
                       u.avatarUrl,
                       m.role,
                       m.joinedAt)
              from HouseholdMember m
              join m.user u
             where m.household.id = :householdId
             order by case when m.role = :adminRole then 0 else 1 end, m.joinedAt asc, u.id asc
            """)
    List<HouseholdMemberResponse> findMembersOf(@Param("householdId") UUID householdId,
                                                @Param("adminRole") HouseholdRole adminRole);

    /** La misma forma que el listado, para una sola persona. */
    @Query("""
            select new com.cellier.household.dto.HouseholdMemberResponse(
                       u.id,
                       u.displayName,
                       u.email,
                       u.avatarUrl,
                       m.role,
                       m.joinedAt)
              from HouseholdMember m
              join m.user u
             where m.household.id = :householdId
               and u.id = :userId
            """)
    Optional<HouseholdMemberResponse> findMemberOf(@Param("householdId") UUID householdId,
                                                   @Param("userId") UUID userId);

    /**
     * Los hogares del usuario con su rol y el tamaño de cada grupo, en una sola consulta.
     *
     * <p>El orden es estable —nombre y, a igualdad, identificador— porque el selector de
     * hogar del cliente no debe reordenarse entre recargas. Sin el desempate por id, dos
     * hogares homónimos quedarían a merced del plan de ejecución.
     */
    @Query("""
            select new com.cellier.household.dto.HouseholdSummaryResponse(
                       h.id,
                       h.name,
                       m.role,
                       (select count(otro) from HouseholdMember otro where otro.household = h))
              from HouseholdMember m
              join m.household h
             where m.user.id = :userId
             order by h.name asc, h.id asc
            """)
    List<HouseholdSummaryResponse> findSummariesByUserId(@Param("userId") UUID userId);
}
