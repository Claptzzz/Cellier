package com.cellier.household;

import com.cellier.household.domain.JoinRequest;
import com.cellier.household.domain.JoinRequestStatus;
import com.cellier.household.dto.JoinRequestResponse;
import com.cellier.household.dto.MyJoinRequestResponse;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface JoinRequestRepository extends JpaRepository<JoinRequest, UUID> {

    /**
     * ¿Tiene ya esta persona una solicitud viva en este hogar? El índice único parcial
     * {@code uq_join_requests_pending} lo garantiza en la base; esta consulta permite
     * responder con un 409 explicativo en vez de con un error de integridad.
     */
    boolean existsByHouseholdIdAndUserIdAndStatus(UUID householdId, UUID userId, JoinRequestStatus status);

    /**
     * La solicitud, pero solo si pertenece a ese hogar. Emparejar los dos identificadores
     * evita que un administrador resuelva, desde la ruta de su hogar, una solicitud dirigida
     * a otro.
     */
    Optional<JoinRequest> findByIdAndHouseholdId(UUID id, UUID householdId);

    /** La solicitud, pero solo si la envió esa persona. Sirve para cancelarla. */
    Optional<JoinRequest> findByIdAndUserId(UUID id, UUID userId);

    /** Las solicitudes propias, de la más reciente a la más antigua. */
    @Query("""
            select new com.cellier.household.dto.MyJoinRequestResponse(
                       jr.id,
                       h.id,
                       h.name,
                       jr.status,
                       jr.requestedAt,
                       jr.resolvedAt)
              from JoinRequest jr
              join jr.household h
             where jr.user.id = :userId
             order by jr.requestedAt desc, jr.id asc
            """)
    List<MyJoinRequestResponse> findMine(@Param("userId") UUID userId);

    /**
     * La bandeja del administrador: las solicitudes de un hogar con los datos de cada
     * solicitante, en una sola consulta.
     *
     * <p>Las pendientes primero —son las que piden una decisión— y dentro de cada grupo, de la
     * más reciente a la más antigua.
     */
    @Query("""
            select new com.cellier.household.dto.JoinRequestResponse(
                       jr.id,
                       u.id,
                       u.displayName,
                       u.email,
                       u.avatarUrl,
                       jr.status,
                       jr.requestedAt,
                       jr.resolvedAt,
                       resolver.id)
              from JoinRequest jr
              join jr.user u
              left join jr.resolvedBy resolver
             where jr.household.id = :householdId
             order by case when jr.status = com.cellier.household.domain.JoinRequestStatus.PENDING then 0 else 1 end,
                      jr.requestedAt desc, jr.id asc
            """)
    List<JoinRequestResponse> findForHousehold(@Param("householdId") UUID householdId);

    /**
     * La misma bandeja, filtrada por estado.
     *
     * <p>Va en un método aparte en vez de en un {@code (:status is null or ...)}: ese patrón
     * falla en tiempo de ejecución sólo cuando el filtro llega vacío. El porqué y la salida
     * están en {@code docs/reglas-esquema.md}, sección «Un parámetro comparado con null en
     * JPQL no tiene tipo».
     */
    @Query("""
            select new com.cellier.household.dto.JoinRequestResponse(
                       jr.id,
                       u.id,
                       u.displayName,
                       u.email,
                       u.avatarUrl,
                       jr.status,
                       jr.requestedAt,
                       jr.resolvedAt,
                       resolver.id)
              from JoinRequest jr
              join jr.user u
              left join jr.resolvedBy resolver
             where jr.household.id = :householdId
               and jr.status = :status
             order by jr.requestedAt desc, jr.id asc
            """)
    List<JoinRequestResponse> findForHouseholdByStatus(@Param("householdId") UUID householdId,
                                                        @Param("status") JoinRequestStatus status);

    /** La solicitud recién resuelta, con la forma que devuelve la bandeja. */
    @Query("""
            select new com.cellier.household.dto.JoinRequestResponse(
                       jr.id,
                       u.id,
                       u.displayName,
                       u.email,
                       u.avatarUrl,
                       jr.status,
                       jr.requestedAt,
                       jr.resolvedAt,
                       resolver.id)
              from JoinRequest jr
              join jr.user u
              left join jr.resolvedBy resolver
             where jr.id = :id
            """)
    Optional<JoinRequestResponse> findProjectionById(@Param("id") UUID id);
}
