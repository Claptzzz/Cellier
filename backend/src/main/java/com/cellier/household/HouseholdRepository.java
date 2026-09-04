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

    /** Resuelve el código que teclea quien quiere entrar. Llega ya normalizado a mayúsculas. */
    Optional<Household> findByJoinCode(String joinCode);

    /**
     * Toma la fila del hogar en exclusiva para serializar los cambios de membresía.
     *
     * <p><strong>No quites esta llamada.</strong> Parece prescindible —el método no lee nada
     * del hogar, solo lo bloquea— y no lo es.
     *
     * <p><b>Qué protege.</b> R4: el hogar conserva siempre al menos un administrador. Sin el
     * bloqueo hay una carrera real: dos administradores que se quitan el rol a la vez leen
     * ambos «quedan 2», ambos pasan la comprobación, y el hogar acaba con cero. A partir de
     * ahí nadie puede administrarlo, aprobar solicitudes ni borrarlo: el hogar queda
     * congelado con sus miembros dentro y sin salida.
     *
     * <p><b>Por qué se bloquea el hogar y no la membresía.</b> Porque R4 no es una condición
     * sobre la fila que se escribe, sino sobre el <em>conjunto</em> de miembros. Los dos
     * administradores del ejemplo modifican filas <em>distintas</em>: no colisionan, así que
     * ni un bloqueo optimista con {@code @Version} sobre {@code HouseholdMember} ni un
     * {@code FOR UPDATE} sobre esas filas detectarían nada. Hace falta un punto de
     * serialización común a todas las membresías del hogar, y la fila del hogar es el único
     * que existe sin inventar un candado artificial.
     *
     * <p><b>Cómo se comprueba.</b>
     * {@code HouseholdMembershipIntegrationTest.degradacionesSimultaneasNoVacianElHogar}
     * ejecuta el escenario con dos hilos y transacciones distintas, repetido 25 veces. Si se
     * retira este bloqueo, falla con «el hogar se quedó sin administrador ([ok, ok])». Las
     * repeticiones no son decorativas: con una sola tirada el test pasaba igual sin bloqueo,
     * porque la ventana entre contar administradores y confirmar dura microsegundos.
     *
     * <p><b>Qué cuesta.</b> Nada apreciable. Los cambios de membresía son raros y el bloqueo
     * solo excluye a otros cambios de membresía <em>del mismo hogar</em>: no toca lecturas ni
     * a los demás hogares.
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
