package com.cellier.household;

import com.cellier.household.domain.Household;
import com.cellier.household.dto.HouseholdDetailResponse;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface HouseholdRepository extends JpaRepository<Household, UUID> {

    boolean existsByJoinCode(String joinCode);

    /**
     * Toma la fila del hogar en exclusiva para serializar los cambios de membresía.
     *
     * <p>Sin esto, la comprobación de R4 tiene una carrera: dos administradores que se
     * degradan a la vez leerían ambos «quedan 2 administradores», ambos pasarían la
     * comprobación y el hogar acabaría con cero. La condición no es sobre la fila que se
     * escribe, sino sobre el conjunto de miembros, así que ningún bloqueo optimista de la
     * membresía la cubriría; hace falta un punto de serialización común, y el hogar lo es.
     *
     * <p>El coste es despreciable: los cambios de membresía son raros y el bloqueo solo
     * excluye a otros cambios de membresía <em>del mismo hogar</em>.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select h from Household h where h.id = :householdId")
    Optional<Household> findByIdForUpdate(@Param("householdId") UUID householdId);

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
