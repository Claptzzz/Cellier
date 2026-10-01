package com.cellier.household;

import com.cellier.household.dto.HouseholdSummaryResponse;
import com.cellier.shared.error.ConflictException;

import java.util.List;
import java.util.Map;

/**
 * Quien se da de baja es el único administrador de uno o más hogares.
 *
 * <p>El cuerpo lleva la lista de esos hogares para que la UI explique qué hacer primero
 * —traspasar la administración o eliminar el hogar— sin una segunda llamada para averiguar
 * cuáles son.
 */
public class LastAdminOnAccountDeletionException extends ConflictException {

    private final List<HouseholdSummaryResponse> blockingHouseholds;

    public LastAdminOnAccountDeletionException(List<HouseholdSummaryResponse> blockingHouseholds) {
        super("Eres el único administrador de "
                + (blockingHouseholds.size() == 1 ? "un hogar" : blockingHouseholds.size() + " hogares")
                + ". Traspasa la administración a otro miembro o elimina el hogar antes de eliminar tu cuenta.");
        this.blockingHouseholds = blockingHouseholds;
    }

    @Override
    public Map<String, Object> getProperties() {
        return Map.of("blockingHouseholds", blockingHouseholds.stream()
                .map(h -> Map.of("id", h.id(), "name", h.name()))
                .toList());
    }
}
