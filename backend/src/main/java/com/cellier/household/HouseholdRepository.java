package com.cellier.household;

import com.cellier.household.domain.Household;
import com.cellier.household.dto.HouseholdDetailResponse;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface HouseholdRepository extends JpaRepository<Household, UUID> {

    boolean existsByJoinCode(String joinCode);

    /**
     * Detalle del hogar junto con el rol de quien pregunta y el tamaño del grupo, en una sola
     * consulta. El {@code join} con la membresía hace además que la fila no aparezca si el
     * usuario no pertenece al hogar, de modo que la proyección no puede devolver por descuido
     * datos de un hogar ajeno.
     *
     * <p>La subconsulta del recuento viaja dentro del mismo SELECT: no es un N+1, es una
     * columna calculada.
     */
    @Query("""
            select new com.cellier.household.dto.HouseholdDetailResponse(
                       h.id,
                       h.name,
                       h.joinCode,
                       m.role,
                       (select count(otro) from HouseholdMember otro where otro.household = h),
                       h.createdAt)
              from HouseholdMember m
              join m.household h
             where h.id = :householdId
               and m.user.id = :userId
            """)
    Optional<HouseholdDetailResponse> findDetailFor(@Param("householdId") UUID householdId,
                                                    @Param("userId") UUID userId);
}
