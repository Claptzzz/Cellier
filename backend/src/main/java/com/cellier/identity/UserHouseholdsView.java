package com.cellier.identity;

import com.cellier.household.dto.HouseholdSummaryResponse;

import java.util.List;
import java.util.UUID;

/**
 * Los hogares de un usuario, vistos desde identidad.
 *
 * <p>El perfil incluye la lista de hogares, pero {@code identity} no puede llamar a los
 * servicios de {@code household}: el módulo de hogares ya depende de este —necesita
 * {@code User} y {@code CurrentUserService}— y la llamada inversa cerraría el ciclo.
 *
 * <p>La interfaz se declara aquí, en el módulo que la necesita, y la implementa el módulo que
 * sabe responderla. Así la dependencia sigue yendo en un solo sentido: {@code household}
 * conoce a {@code identity}, nunca al revés. Lo único que este módulo toma prestado es el DTO
 * de la respuesta, que es un tipo de datos y no una pieza de comportamiento; usar el mismo
 * evita, además, publicar dos esquemas idénticos en OpenAPI.
 */
public interface UserHouseholdsView {

    /**
     * @return los hogares del usuario con su rol y el tamaño de cada grupo, en orden estable
     *         y resueltos en una sola consulta; lista vacía si no pertenece a ninguno
     */
    List<HouseholdSummaryResponse> householdsOf(UUID userId);
}
