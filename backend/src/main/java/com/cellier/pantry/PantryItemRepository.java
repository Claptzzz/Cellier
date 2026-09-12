package com.cellier.pantry;

import com.cellier.pantry.domain.PantryItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PantryItemRepository extends JpaRepository<PantryItem, UUID> {

    /**
     * El artículo dentro de ESE hogar. Emparejar los dos identificadores es lo que hace que
     * un artículo ajeno responda 404 en vez de dejarse tocar.
     */
    Optional<PantryItem> findByIdAndHouseholdId(UUID id, UUID householdId);

    /** Si ese producto ya está en la despensa del hogar. Una fila por producto. */
    Optional<PantryItem> findByHouseholdIdAndProductId(UUID householdId, UUID productId);
}
