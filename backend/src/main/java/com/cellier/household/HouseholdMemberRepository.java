package com.cellier.household;

import com.cellier.household.domain.HouseholdMember;
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
